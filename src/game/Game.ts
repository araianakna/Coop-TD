import * as THREE from "three";
import "@/ui/ui.css";
import { createRenderer } from "@/core/Renderer";
import { createCamera, RtsCameraController } from "@/core/Camera";
import { createLightingRig } from "@/core/Lighting";
import { createSkybox } from "@/game/world/Skybox";
import { createTerrain } from "@/game/world/Terrain";
import { createFoliage } from "@/game/world/Foliage";
import { createAtmosphereFx } from "@/game/world/AtmosphereFx";
import { buildMap01, type MapDef } from "@/game/world/Map01";
import { buildMap02 } from "@/game/world/Map02";
import { Economy } from "@/game/economy/Economy";
import { InputManager, type CursorState, type PlayerSlot } from "@/game/input/InputManager";
import type {
  DamageInstance,
  Element,
  EnemyDef,
  FusionElementPair,
  GridCoord,
  StatusEffect,
  StatusEffectKind,
  TowerAbility,
  TowerAbilityContext,
  TowerDef,
  TowerTierDef,
} from "@/game/types";
import { getTowerDef, listBaseTowers } from "@/game/towers/TowerRegistry";
import { getFusionRecipe } from "@/game/towers/FusionMatrix";
import { getGrandFusionRecipe } from "@/game/towers/GrandFusionMatrix";
import {
  animateTowerModel,
  createTowerModel,
  releaseTowerCoreMaterial,
  updateTowerVfxTime,
} from "@/game/towers/models";
import { getEnemyDef } from "@/game/enemies/EnemyRegistry";
import { createEnemyModel } from "@/game/enemies/models";
import { getWave, TOTAL_WAVES } from "@/game/enemies/WaveManager";
import { VfxManager } from "@/game/vfx/VfxManager";
import { createHUD } from "@/ui/HUD";
import { createShopPanel, type ShopPanel } from "@/ui/ShopPanel";
import { createFusionPanel, type FusionCandidatePair, type FusionPanelApi } from "@/ui/FusionPanel";
import { createTowerInspector, type TowerInspector } from "@/ui/TowerInspector";
import { createCursorIndicators, type CursorIndicators } from "@/ui/CursorIndicators";
import { createVictoryScreen, createDefeatScreen, type EndScreen } from "@/ui/EndScreens";
import { AudioSystem } from "@/audio";

export type MapChoice = "map01" | "map02";

const STARTING_GOLD = 260;
const STARTING_LIVES = 20;
const FIRST_WAVE_DELAY_SECONDS = 3;
const BETWEEN_WAVE_DELAY_SECONDS = 3;
const FUSION_COST_FACTOR = 0.5; // fusing "recycles" both source towers, so it's cheaper than buying the fusion outright
const SELL_REFUND_FACTOR = 0.5;
const BOUNTY_MULTIPLIER = 1.35; // gold-per-kill boost, layered on top of busier waves for a richer economy
const WAVE_CLEAR_BONUS_BASE = 25;
const WAVE_CLEAR_BONUS_PER_WAVE = 3;
/**
 * Global sim-speed multiplier: scales the dt fed into wave scheduling, tower
 * cooldowns/projectiles, enemy movement, status-effect ticking, and VFX —
 * everything that makes the game "play out" — while the camera controller
 * still gets real, unscaled dt so touch/mouse panning stays responsive
 * instead of feeling twitchy.
 */
const GAME_SPEED = 1.35;

/**
 * Signature secondary effect each element has a chance to apply on every
 * regular (non-ability) hit, layered on top of the towers' existing
 * periodic special abilities (Ignite, Deep Chill, Overcharge, ...) — so an
 * element's identity comes through on ordinary attacks too, not just once
 * every several seconds. Fusion/grand-fusion towers alternate which
 * element fires each shot (see `altShot` in `fireProjectile`), so they
 * naturally roll procs from both/all of their parent elements over time
 * with no per-tower-id table needed here.
 */
const ON_HIT_PROC: Record<
  Element,
  { chance: number; kind: StatusEffectKind; magnitude: number; durationMs: number }
> = {
  fire: { chance: 0.3, kind: "burn", magnitude: 4, durationMs: 2200 },
  ice: { chance: 0.35, kind: "chill", magnitude: 0.22, durationMs: 1400 },
  lightning: { chance: 0.25, kind: "shock", magnitude: 0.5, durationMs: 700 },
  nature: { chance: 0.3, kind: "poison", magnitude: 3, durationMs: 2500 },
  earth: { chance: 0.3, kind: "sunder", magnitude: 0.15, durationMs: 2500 },
  arcane: { chance: 0.2, kind: "silence", magnitude: 1, durationMs: 1200 },
};

interface TowerInstance {
  id: string;
  def: TowerDef;
  tier: 1 | 2 | 3;
  coord: GridCoord;
  group: THREE.Group;
  cooldownMs: number;
  abilityCooldowns: Map<string, number>;
  goldSpent: number;
  altShot: boolean;
}

interface EnemyInstance {
  id: string;
  def: EnemyDef;
  group: THREE.Group;
  updateFn: (dtSeconds: number, elapsedSeconds: number) => void;
  waypointIndex: number;
  progress: number;
  health: number;
  maxHealth: number;
  statusEffects: StatusEffect[];
  speedMultiplier: number;
  healthBarFg: THREE.Mesh;
}

interface QueuedSpawn {
  enemyId: string;
  healthMultiplier: number;
  atElapsed: number;
}

export class Game {
  private scene = new THREE.Scene();
  private camera = createCamera(window.innerWidth / window.innerHeight);
  private cameraController: RtsCameraController;
  private rendererBundle: ReturnType<typeof createRenderer>;
  private clock = new THREE.Clock();
  private elapsed = 0;
  private input: InputManager;
  private raycaster = new THREE.Raycaster();

  private map: MapDef;
  private economy = new Economy(STARTING_GOLD, STARTING_LIVES);
  private vfx: VfxManager;
  private audio = new AudioSystem();

  private tickables: THREE.Object3D[] = [];
  private cellMarkers: THREE.Mesh[] = [];
  private buildRings: THREE.Mesh[] = [];

  private towers: TowerInstance[] = [];
  private enemies: EnemyInstance[] = [];
  private towerIdCounter = 0;
  private enemyIdCounter = 0;

  private armedTowerDefId: string | null = null;
  private selectedTowerIds: string[] = [];

  private waveIndex = 0;
  private spawnQueue: QueuedSpawn[] = [];
  private nextWaveAtElapsed: number | null = FIRST_WAVE_DELAY_SECONDS;
  private gameOver = false;
  private victory = false;
  private campaignCompleteAnnounced = false;

  private hud: ReturnType<typeof createHUD>;
  private shop: ShopPanel;
  private fusion: FusionPanelApi;
  private inspector: TowerInspector;
  private cursors: CursorIndicators;
  private victoryScreen: EndScreen;
  private defeatScreen: EndScreen;

  constructor(host: HTMLElement, mapId: MapChoice = "map01") {
    this.map = mapId === "map02" ? buildMap02() : buildMap01();
    // Game is only ever constructed from inside the StartScreen's map-select
    // click handler, so this synchronous call satisfies the browser's
    // autoplay-gesture requirement.
    void this.audio.unlock().then((ok) => {
      if (ok) this.audio.music.startAmbient();
    });
    this.scene.background = new THREE.Color(0x120a1f);

    const skybox = createSkybox();
    this.scene.add(skybox);
    this.tickables.push(skybox);
    createLightingRig(this.scene);

    this.cameraController = new RtsCameraController(this.camera, host);
    this.rendererBundle = createRenderer(host, this.scene, this.camera);
    this.input = new InputManager(this.rendererBundle.renderer.domElement);
    this.vfx = new VfxManager(this.scene);

    const terrain = createTerrain(this.map.grid);
    this.scene.add(terrain);
    this.tickables.push(terrain);

    this.scene.add(createFoliage(this.map.grid));

    const atmosphere = createAtmosphereFx(this.map.grid);
    this.scene.add(atmosphere);
    this.tickables.push(atmosphere);

    this.addBuildableMarkers();

    // --- UI layer -----------------------------------------------------
    const uiRoot = document.createElement("div");
    uiRoot.id = "rw-ui-root";
    uiRoot.style.position = "absolute";
    uiRoot.style.inset = "0";
    uiRoot.style.pointerEvents = "none";
    uiRoot.style.zIndex = "10";
    host.appendChild(uiRoot);

    const rotateHint = document.createElement("div");
    rotateHint.className = "rw-rotate-hint";
    rotateHint.textContent = "↻ Rotate for a wider view";
    uiRoot.appendChild(rotateHint);

    this.hud = createHUD(this.economy);
    uiRoot.appendChild(this.hud.el);

    this.shop = createShopPanel({
      towers: listBaseTowers(),
      economy: this.economy,
      onSelect: (tower) => this.handleShopSelect(tower),
    });
    this.shop.el.classList.add("rw-anchor-shop");
    uiRoot.appendChild(this.shop.el);

    this.fusion = createFusionPanel({
      getCandidatePairs: () => this.getFusionCandidatePairs(),
      onConfirm: (pairId) => this.handleFusionConfirm(pairId),
      onCancel: () => this.clearSelection(),
    });
    this.fusion.el.classList.add("rw-anchor-fusion");
    uiRoot.appendChild(this.fusion.el);

    this.inspector = createTowerInspector({
      onUpgrade: () => this.handleUpgrade(),
      onSell: () => this.handleSell(),
    });
    this.inspector.el.classList.add("rw-anchor-inspector");
    this.inspector.hide();
    uiRoot.appendChild(this.inspector.el);

    this.cursors = createCursorIndicators();
    uiRoot.appendChild(this.cursors.container);

    this.victoryScreen = createVictoryScreen({ onRestart: () => window.location.reload() });
    this.victoryScreen.el.style.pointerEvents = "auto";
    uiRoot.appendChild(this.victoryScreen.el);

    this.defeatScreen = createDefeatScreen({ onRestart: () => window.location.reload() });
    this.defeatScreen.el.style.pointerEvents = "auto";
    uiRoot.appendChild(this.defeatScreen.el);

    window.addEventListener("resize", () => this.onResize());
    this.onResize();

    this.rendererBundle.renderer.domElement.addEventListener("click", (e) => {
      const rect = this.rendererBundle.renderer.domElement.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.performInteractionAt(ndcX, ndcY);
    });

    requestAnimationFrame(this.loop);
  }

  // -------------------------------------------------------------------
  // Buildable tile markers (visual ring + invisible full-tile hit area)
  // -------------------------------------------------------------------

  private addBuildableMarkers() {
    // Rings default to hidden — with ~190 buildable cells on this map,
    // showing every ring at all times reads as a wall-to-wall checkerboard
    // that drowns out the path/terrain and makes towers/enemies harder to
    // read in motion. Instead they only light up while a tower is armed for
    // placement (see setBuildRingsVisible), matching the "show placement
    // options on demand" convention most TD games use (Kingdom Rush, BTD6).
    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const hitGeo = new THREE.CircleGeometry(0.95, 16);
    hitGeo.rotateX(-Math.PI / 2);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    for (const cell of this.map.grid.allCells()) {
      if (cell.kind !== "buildable") continue;
      const [wx, wz] = this.map.grid.gridToWorld(cell);

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(wx, 0.06, wz);
      ring.visible = false;
      this.scene.add(ring);
      this.buildRings.push(ring);

      const hitArea = new THREE.Mesh(hitGeo, hitMat);
      hitArea.position.set(wx, 0.06, wz);
      hitArea.userData.gridCoord = { x: cell.x, z: cell.z };
      this.scene.add(hitArea);
      this.cellMarkers.push(hitArea);
    }
  }

  private setBuildRingsVisible(visible: boolean) {
    for (const ring of this.buildRings) ring.visible = visible;
  }

  // -------------------------------------------------------------------
  // Input / selection
  // -------------------------------------------------------------------

  private handleShopSelect(tower: TowerDef) {
    if (this.armedTowerDefId === tower.id) {
      this.armedTowerDefId = null;
      this.shop.setSelected(null);
      this.setBuildRingsVisible(false);
      this.audio.ui.click();
      return;
    }
    if (!this.economy.canAfford(tower.tiers[0].cost)) {
      this.audio.ui.denied();
      return;
    }
    this.armedTowerDefId = tower.id;
    this.shop.setSelected(tower.id);
    this.setBuildRingsVisible(true);
    this.clearSelection();
    this.audio.ui.select();
  }

  private performInteractionAt(ndcX: number, ndcY: number) {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    if (this.armedTowerDefId) {
      const hits = this.raycaster.intersectObjects(this.cellMarkers);
      if (hits.length > 0) {
        const coord = hits[0].object.userData.gridCoord as GridCoord;
        const def = getTowerDef(this.armedTowerDefId);
        if (def) this.tryPlaceTower(coord, def);
      }
      return;
    }

    const hits = this.raycaster.intersectObjects(
      this.towers.map((t) => t.group),
      true,
    );
    if (hits.length > 0) {
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && obj.userData.towerId === undefined) obj = obj.parent;
      if (obj) {
        this.toggleTowerSelection(obj.userData.towerId as string);
        return;
      }
    }
    this.clearSelection();
  }

  /**
   * A tower's visual model can have gaps/hollows at the exact tile center
   * (rings of accent rocks, floating discs, etc.), so raycasting against the
   * model geometry alone can miss a click dead-center on a placed tower —
   * the same class of bug as the buildable-tile ring markers earlier. This
   * adds an invisible full-footprint cylinder so tower selection is always
   * hit-testable regardless of the model's actual silhouette.
   */
  private addSelectionHitArea(group: THREE.Group) {
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 2, 12),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = 1;
    group.add(hit);
  }

  private tryPlaceTower(coord: GridCoord, def: TowerDef) {
    const cost = def.tiers[0].cost;
    if (!this.economy.canAfford(cost)) return;
    if (!this.map.grid.isBuildable(coord.x, coord.z)) return;

    const id = `tower-${this.towerIdCounter++}`;
    if (!this.map.grid.placeTower(coord.x, coord.z, id)) return;
    this.economy.spend(cost);

    const group = createTowerModel(def.modelId, 1);
    const [wx, wz] = this.map.grid.gridToWorld(coord);
    group.position.set(wx, 0, wz);
    group.userData.towerId = id;
    this.addSelectionHitArea(group);
    this.scene.add(group);

    this.towers.push({
      id,
      def,
      tier: 1,
      coord,
      group,
      cooldownMs: 0,
      abilityCooldowns: new Map(),
      goldSpent: cost,
      altShot: false,
    });

    this.armedTowerDefId = null;
    this.shop.setSelected(null);
    this.setBuildRingsVisible(false);
    this.audio.combat.towerPlaced();
  }

  private toggleTowerSelection(towerId: string) {
    if (this.selectedTowerIds.includes(towerId)) {
      this.selectedTowerIds = this.selectedTowerIds.filter((id) => id !== towerId);
    } else {
      if (this.selectedTowerIds.length >= 2) this.selectedTowerIds = [];
      this.selectedTowerIds.push(towerId);
    }
    this.refreshSelectionUI();
  }

  private clearSelection() {
    if (this.selectedTowerIds.length === 0) return;
    this.selectedTowerIds = [];
    this.refreshSelectionUI();
  }

  private refreshSelectionUI() {
    if (this.selectedTowerIds.length === 2) {
      this.inspector.hide();
      this.fusion.open();
      return;
    }
    this.fusion.close();

    if (this.selectedTowerIds.length === 1) {
      const tower = this.towers.find((t) => t.id === this.selectedTowerIds[0]);
      if (tower) {
        this.inspector.show(this.buildInspectorInfo(tower));
        return;
      }
    }
    this.inspector.hide();
  }

  private buildInspectorInfo(tower: TowerInstance) {
    const tiers: TowerTierDef[] = tower.def.tiers;
    const tierDef = tiers[tower.tier - 1];
    const nextTierDef = tower.tier < 3 ? tiers[tower.tier] : null;
    return {
      name: tower.def.name,
      element: tower.def.element,
      tier: tower.tier,
      description: tierDef.description,
      nextTierCost: nextTierDef ? nextTierDef.cost : null,
      canAffordUpgrade: nextTierDef ? this.economy.canAfford(nextTierDef.cost) : false,
      sellValue: Math.round(tower.goldSpent * SELL_REFUND_FACTOR),
    };
  }

  // -------------------------------------------------------------------
  // Fusion
  // -------------------------------------------------------------------

  private getFusionCandidatePairs(): FusionCandidatePair[] {
    if (this.selectedTowerIds.length !== 2) return [];
    const [towerA, towerB] = this.selectedTowerIds.map((id) => this.towers.find((t) => t.id === id));
    if (!towerA || !towerB) return [];

    // Base + base -> a standard 2-element fusion (the original 15 recipes).
    if (!towerA.def.isFusion && !towerB.def.isFusion) {
      const elA = towerA.def.element as Element;
      const elB = towerB.def.element as Element;
      const recipe = getFusionRecipe(elA, elB);
      if (!recipe) return [];
      const resultDef = getTowerDef(recipe.resultTowerId);
      if (!resultDef) return [];

      const cost = Math.round(resultDef.tiers[0].cost * FUSION_COST_FACTOR);
      return [
        {
          id: recipe.resultTowerId,
          towerA: { id: towerA.id, name: towerA.def.name, element: elA },
          towerB: { id: towerB.id, name: towerB.def.name, element: elB },
          resultName: resultDef.name,
          resultElementPair: resultDef.element as FusionElementPair,
          flavorText: resultDef.flavorText,
          cost,
          affordable: this.economy.canAfford(cost),
        },
      ];
    }

    // Fusion + base (a third, distinct element) -> a curated Grand Fusion.
    const fusionTower = towerA.def.isFusion ? towerA : towerB.def.isFusion ? towerB : null;
    const baseTower = fusionTower === towerA ? towerB : towerA;
    if (!fusionTower || baseTower.def.isFusion) return [];

    const [fA, fB] = this.towerElements(fusionTower);
    const thirdElement = baseTower.def.element as Element;
    if (!fB || thirdElement === fA || thirdElement === fB) return [];

    const recipe = getGrandFusionRecipe(fusionTower.def.id, thirdElement);
    if (!recipe) return [];
    const resultDef = getTowerDef(recipe.resultTowerId);
    if (!resultDef) return [];

    const cost = Math.round(resultDef.tiers[0].cost * FUSION_COST_FACTOR);
    return [
      {
        id: recipe.resultTowerId,
        towerA: { id: fusionTower.id, name: fusionTower.def.name, element: fA },
        towerB: { id: baseTower.id, name: baseTower.def.name, element: thirdElement },
        resultName: resultDef.name,
        resultElementPair: resultDef.element as FusionElementPair,
        flavorText: resultDef.flavorText,
        cost,
        affordable: this.economy.canAfford(cost),
      },
    ];
  }

  private handleFusionConfirm(pairId: string) {
    const candidates = this.getFusionCandidatePairs();
    const candidate = candidates.find((c) => c.id === pairId);
    if (!candidate || candidate.affordable === false) return;
    if (candidate.cost !== undefined && !this.economy.canAfford(candidate.cost)) return;

    const towerA = this.towers.find((t) => t.id === candidate.towerA.id);
    const towerB = this.towers.find((t) => t.id === candidate.towerB.id);
    if (!towerA || !towerB) return;

    const resultDef = getTowerDef(pairId);
    if (!resultDef) return;

    if (candidate.cost !== undefined) this.economy.spend(candidate.cost);

    const coord = towerA.coord;
    this.disposeTowerGroup(towerA.group);
    this.disposeTowerGroup(towerB.group);
    this.map.grid.removeTower(towerA.coord.x, towerA.coord.z);
    this.map.grid.removeTower(towerB.coord.x, towerB.coord.z);
    this.towers = this.towers.filter((t) => t !== towerA && t !== towerB);

    const id = `tower-${this.towerIdCounter++}`;
    this.map.grid.placeTower(coord.x, coord.z, id);
    const group = createTowerModel(resultDef.modelId, 1);
    const [wx, wz] = this.map.grid.gridToWorld(coord);
    group.position.set(wx, 0, wz);
    group.userData.towerId = id;
    this.addSelectionHitArea(group);
    this.scene.add(group);

    this.towers.push({
      id,
      def: resultDef,
      tier: 1,
      coord,
      group,
      cooldownMs: 0,
      abilityCooldowns: new Map(),
      goldSpent: (candidate.cost ?? 0) + towerA.goldSpent + towerB.goldSpent,
      altShot: false,
    });

    this.vfx.impacts.triggerFusion(candidate.towerA.element, candidate.towerB.element, [wx, 0.8, wz]);
    this.audio.combat.fusionComplete();

    this.selectedTowerIds = [];
    this.fusion.close();
    this.inspector.hide();
  }

  // -------------------------------------------------------------------
  // Upgrade / sell
  // -------------------------------------------------------------------

  private handleUpgrade() {
    const tower = this.towers.find((t) => t.id === this.selectedTowerIds[0]);
    if (!tower || tower.tier >= 3) return;
    const tiers: TowerTierDef[] = tower.def.tiers;
    const nextTierDef = tiers[tower.tier];
    if (!this.economy.canAfford(nextTierDef.cost)) {
      this.audio.ui.denied();
      return;
    }

    this.economy.spend(nextTierDef.cost);
    tower.goldSpent += nextTierDef.cost;
    tower.tier = (tower.tier + 1) as 1 | 2 | 3;

    this.disposeTowerGroup(tower.group);
    const group = createTowerModel(tower.def.modelId, tower.tier);
    const [wx, wz] = this.map.grid.gridToWorld(tower.coord);
    group.position.set(wx, 0, wz);
    group.userData.towerId = tower.id;
    this.addSelectionHitArea(group);
    this.scene.add(group);
    tower.group = group;

    this.inspector.show(this.buildInspectorInfo(tower));
    this.audio.combat.towerUpgraded();
  }

  private handleSell() {
    const tower = this.towers.find((t) => t.id === this.selectedTowerIds[0]);
    if (!tower) return;
    this.economy.earn(Math.round(tower.goldSpent * SELL_REFUND_FACTOR));
    this.disposeTowerGroup(tower.group);
    this.map.grid.removeTower(tower.coord.x, tower.coord.z);
    this.towers = this.towers.filter((t) => t !== tower);
    this.clearSelection();
    this.audio.combat.towerSold();
  }

  private disposeTowerGroup(group: THREE.Group) {
    group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
          try {
            releaseTowerCoreMaterial(mat as THREE.ShaderMaterial);
          } catch {
            // not a registered core material — fine, nothing to release
          }
        }
        mat.dispose();
      }
      mesh.geometry?.dispose();
    });
    this.scene.remove(group);
  }

  // -------------------------------------------------------------------
  // Waves / spawning
  // -------------------------------------------------------------------

  private updateWaves() {
    if (this.gameOver || this.victory) return;

    if (this.nextWaveAtElapsed !== null && this.elapsed >= this.nextWaveAtElapsed) {
      this.nextWaveAtElapsed = null;
      this.startWave(this.waveIndex + 1);
    }

    while (this.spawnQueue.length > 0 && this.spawnQueue[0].atElapsed <= this.elapsed) {
      const next = this.spawnQueue.shift()!;
      this.spawnEnemy(next.enemyId, next.healthMultiplier);
    }

    if (
      this.waveIndex > 0 &&
      this.spawnQueue.length === 0 &&
      this.enemies.length === 0 &&
      this.nextWaveAtElapsed === null
    ) {
      this.economy.earn(Math.round(WAVE_CLEAR_BONUS_BASE + this.waveIndex * WAVE_CLEAR_BONUS_PER_WAVE));

      // The hand-authored campaign ends at TOTAL_WAVES, but the game itself
      // doesn't stop there — endless mode (WaveManager.getWave) keeps
      // synthesizing waves past it. Celebrate clearing the campaign once
      // with the existing victory overlay, then auto-dismiss it and keep
      // playing instead of hard-stopping the sim (never set `this.victory`).
      if (this.waveIndex === TOTAL_WAVES && !this.campaignCompleteAnnounced) {
        this.campaignCompleteAnnounced = true;
        this.audio.music.victory();
        this.victoryScreen.show(this.waveIndex);
        setTimeout(() => this.victoryScreen.hide(), 4000);
      }

      this.nextWaveAtElapsed = this.elapsed + BETWEEN_WAVE_DELAY_SECONDS;
    }
  }

  private startWave(index: number) {
    const wave = getWave(index);
    if (!wave) return;
    this.waveIndex = index;
    this.economy.setWave(index);
    this.audio.music.waveStart();
    if (wave.bossId) this.audio.music.bossIncoming();

    const queue: QueuedSpawn[] = [];
    let latest = this.elapsed;
    for (const entry of wave.spawns) {
      for (let i = 0; i < entry.count; i++) {
        const at = this.elapsed + (i * entry.intervalMs) / 1000;
        queue.push({ enemyId: entry.enemyId, healthMultiplier: entry.healthMultiplier ?? 1, atElapsed: at });
        latest = Math.max(latest, at);
      }
    }
    if (wave.bossId) {
      queue.push({ enemyId: wave.bossId, healthMultiplier: 1, atElapsed: latest + 1.5 });
    }
    queue.sort((a, b) => a.atElapsed - b.atElapsed);
    this.spawnQueue = queue;
  }

  private spawnEnemy(enemyId: string, healthMultiplier: number) {
    const def = getEnemyDef(enemyId);
    const { group, update } = createEnemyModel(def.modelId);

    const spawn = this.map.waypoints[0];
    const [wx, wz] = this.map.grid.gridToWorld(spawn);
    group.position.set(wx, 0, wz);
    this.scene.add(group);

    const barY = def.isBoss ? 2.6 : 1.3;
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(def.isBoss ? 1.6 : 0.6, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    barBg.position.y = barY;
    const barFg = new THREE.Mesh(
      new THREE.PlaneGeometry((def.isBoss ? 1.56 : 0.58), 0.07),
      new THREE.MeshBasicMaterial({ color: def.isBoss ? 0xffb14d : 0x4dff88 }),
    );
    barFg.position.y = barY + 0.001;
    group.add(barBg, barFg);

    const health = Math.round(def.baseHealth * healthMultiplier);

    this.enemies.push({
      id: `enemy-${this.enemyIdCounter++}`,
      def,
      group,
      updateFn: update,
      waypointIndex: 0,
      progress: 0,
      health,
      maxHealth: health,
      statusEffects: [],
      speedMultiplier: 1,
      healthBarFg: barFg,
    });
  }

  // -------------------------------------------------------------------
  // Enemy movement / status effects
  // -------------------------------------------------------------------

  private updateEnemies(dt: number) {
    const wps = this.map.waypoints;
    for (const enemy of [...this.enemies]) {
      this.updateStatusEffects(enemy, dt);
      if (enemy.health <= 0) {
        this.killEnemy(enemy);
        continue;
      }

      if (enemy.waypointIndex >= wps.length - 1) {
        this.economy.loseLife(enemy.def.isBoss ? 5 : 1);
        this.removeEnemy(enemy);
        this.audio.combat.enemyLeaked();
        continue;
      }

      const effectiveSpeed = enemy.def.baseSpeed * enemy.speedMultiplier;
      enemy.progress += (effectiveSpeed * dt) / this.map.grid.cellSize;
      if (enemy.progress >= 1) {
        enemy.progress = 0;
        enemy.waypointIndex++;
      }
      const clampedIdx = Math.min(enemy.waypointIndex, wps.length - 2);
      const a = wps[clampedIdx];
      const b = wps[clampedIdx + 1];
      const [ax, az] = this.map.grid.gridToWorld(a);
      const [bx, bz] = this.map.grid.gridToWorld(b);
      const x = THREE.MathUtils.lerp(ax, bx, enemy.progress);
      const z = THREE.MathUtils.lerp(az, bz, enemy.progress);
      enemy.group.position.set(x, 0, z);
      if (effectiveSpeed > 0.01) enemy.group.lookAt(bx, 0, bz);

      enemy.updateFn(dt, this.elapsed);

      const hpFrac = Math.max(0, enemy.health / enemy.maxHealth);
      enemy.healthBarFg.scale.x = hpFrac;
      enemy.healthBarFg.position.x = -((enemy.def.isBoss ? 0.78 : 0.29) * (1 - hpFrac));
    }
  }

  private updateStatusEffects(enemy: EnemyInstance, dtSeconds: number) {
    const now = Date.now();
    enemy.statusEffects = enemy.statusEffects.filter((e) => now - e.appliedAt < e.durationMs);

    let speedMult = 1;
    for (const effect of enemy.statusEffects) {
      if (effect.kind === "chill" || effect.kind === "shock") speedMult *= 1 - effect.magnitude;
      if (effect.kind === "freeze" || effect.kind === "root") speedMult = 0;
      if (effect.kind === "burn" || effect.kind === "poison") {
        enemy.health -= effect.magnitude * dtSeconds;
      }
    }
    enemy.speedMultiplier = Math.max(0, speedMult);
  }

  /** Shared by ability triggers and on-hit procs: replaces any existing
   * effect of the same kind rather than stacking duplicates. */
  private applyStatusToEnemy(enemy: EnemyInstance, effect: StatusEffect) {
    if (!this.enemies.includes(enemy)) return;
    enemy.statusEffects = enemy.statusEffects.filter((e) => e.kind !== effect.kind);
    enemy.statusEffects.push(effect);
  }

  private tryApplyOnHitProc(enemy: EnemyInstance, tower: TowerInstance, element: Element) {
    const proc = ON_HIT_PROC[element];
    if (Math.random() >= proc.chance) return;
    this.applyStatusToEnemy(enemy, {
      kind: proc.kind,
      magnitude: proc.magnitude,
      durationMs: proc.durationMs,
      appliedAt: Date.now(),
      sourceTowerId: tower.id,
    });
    this.playThrottled(`status:${proc.kind}`, 350, () => this.audio.combat.statusApplied(proc.kind, element));
  }

  private effectiveArmor(enemy: EnemyInstance): number {
    const sunder = enemy.statusEffects.find((e) => e.kind === "sunder");
    return sunder ? enemy.def.armor * (1 - sunder.magnitude) : enemy.def.armor;
  }

  private removeEnemy(enemy: EnemyInstance) {
    this.scene.remove(enemy.group);
    this.enemies = this.enemies.filter((e) => e !== enemy);
  }

  private killEnemy(enemy: EnemyInstance) {
    this.economy.earn(Math.round(enemy.def.bounty * BOUNTY_MULTIPLIER));
    this.removeEnemy(enemy);
    this.audio.combat.enemyDeath(enemy.def.isBoss ?? false);
  }

  /**
   * Combat can fire dozens of projectiles/impacts per second once many
   * towers are placed; playing a sound for every single one stacks into a
   * harsh wall of noise. This chokes repeats of the same (category,element)
   * pair within a short window so variety still comes through without the
   * spam — a standard game-audio "choke group" technique.
   */
  private lastSfxAt = new Map<string, number>();
  private playThrottled(key: string, minIntervalMs: number, play: () => void) {
    const now = performance.now();
    const last = this.lastSfxAt.get(key) ?? -Infinity;
    if (now - last < minIntervalMs) return;
    this.lastSfxAt.set(key, now);
    play();
  }

  // -------------------------------------------------------------------
  // Combat
  // -------------------------------------------------------------------

  private currentTierDef(tower: TowerInstance) {
    return tower.def.tiers[tower.tier - 1];
  }

  private towerElements(tower: TowerInstance): [Element, Element | null] {
    const el = tower.def.element;
    if (el.includes("+")) {
      const [a, b] = el.split("+") as [Element, Element];
      return [a, b];
    }
    return [el as Element, null];
  }

  private pickTarget(tower: TowerInstance): EnemyInstance | null {
    const stats = this.currentTierDef(tower).stats;
    const [twx, twz] = this.map.grid.gridToWorld(tower.coord);
    const inRange = this.enemies.filter((e) => {
      const dx = e.group.position.x - twx;
      const dz = e.group.position.z - twz;
      return Math.hypot(dx, dz) <= stats.range;
    });
    if (inRange.length === 0) return null;

    const progress = (e: EnemyInstance) => e.waypointIndex + e.progress;
    const dist = (e: EnemyInstance) => {
      const dx = e.group.position.x - twx;
      const dz = e.group.position.z - twz;
      return Math.hypot(dx, dz);
    };

    switch (tower.def.targeting) {
      case "first":
        return inRange.reduce((a, b) => (progress(b) > progress(a) ? b : a));
      case "last":
        return inRange.reduce((a, b) => (progress(b) < progress(a) ? b : a));
      case "closest":
        return inRange.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      case "strongest":
        return inRange.reduce((a, b) => (b.health > a.health ? b : a));
      case "weakest":
        return inRange.reduce((a, b) => (b.health < a.health ? b : a));
      default:
        return inRange[0];
    }
  }

  private updateTowers(dtMs: number) {
    for (const tower of this.towers) {
      animateTowerModel(tower.group, this.elapsed);

      const target = this.pickTarget(tower);
      if (target) {
        tower.group.lookAt(target.group.position.x, tower.group.position.y, target.group.position.z);
      }

      tower.cooldownMs -= dtMs;
      if (tower.cooldownMs <= 0 && target) {
        this.fireProjectile(tower, target);
        tower.cooldownMs = this.currentTierDef(tower).stats.fireRateMs;
      }

      for (const ability of tower.def.abilities) {
        if (tower.tier < (ability.minTier ?? 1)) continue;
        const remaining = tower.abilityCooldowns.get(ability.id) ?? 0;
        const updated = remaining - dtMs;
        if (updated <= 0 && target) {
          this.triggerAbility(tower, ability, target);
          tower.abilityCooldowns.set(ability.id, ability.cooldownMs);
        } else {
          tower.abilityCooldowns.set(ability.id, updated);
        }
      }
    }
  }

  private fireProjectile(tower: TowerInstance, target: EnemyInstance) {
    const [elA, elB] = this.towerElements(tower);
    tower.altShot = !tower.altShot;
    const element = elB && tower.altShot ? elB : elA;
    const stats = this.currentTierDef(tower).stats;
    const fromPos: [number, number, number] = [
      tower.group.position.x,
      tower.group.position.y + 0.9,
      tower.group.position.z,
    ];

    this.vfx.projectiles.spawn(element, fromPos, () => target.group.position.toArray() as [number, number, number], {
      speed: stats.projectileSpeed,
      onArrive: (pos) => this.resolveHit(tower, target, pos, stats.damage, stats.splashRadius, stats.critChance, stats.critMultiplier),
    });
    this.playThrottled(`launch:${element}`, 80, () => this.audio.combat.projectileFire(element));
  }

  private resolveHit(
    tower: TowerInstance,
    target: EnemyInstance,
    pos: [number, number, number],
    baseDamage: number,
    splashRadius: number | undefined,
    critChance: number | undefined,
    critMultiplier: number | undefined,
  ) {
    const [elA, elB] = this.towerElements(tower);

    if (this.enemies.includes(target)) {
      this.applyDamage(target, baseDamage, elA, critChance, critMultiplier);
      this.tryApplyOnHitProc(target, tower, elA);
    }

    if (elB) {
      this.vfx.impacts.triggerFusion(elA, elB, pos);
    } else {
      this.vfx.impacts.trigger(elA, pos);
    }
    this.playThrottled(`impact:${elA}`, 60, () => this.audio.combat.impact(elA, pos));

    if (splashRadius) {
      for (const enemy of this.enemies) {
        if (enemy === target) continue;
        const dx = enemy.group.position.x - pos[0];
        const dz = enemy.group.position.z - pos[2];
        if (Math.hypot(dx, dz) <= splashRadius) {
          this.applyDamage(enemy, baseDamage * 0.6, elA, critChance, critMultiplier);
        }
      }
    }
  }

  private applyDamage(
    enemy: EnemyInstance,
    baseDamage: number,
    element: Element,
    critChance?: number,
    critMultiplier?: number,
  ) {
    const mult = enemy.def.resistances[element] ?? enemy.def.weaknesses[element] ?? 1;
    let dmg = baseDamage * mult;
    if (critChance && critMultiplier && Math.random() < critChance) dmg *= critMultiplier;
    const armor = this.effectiveArmor(enemy);
    dmg *= 100 / (100 + armor);
    enemy.health -= dmg;
  }

  private triggerAbility(tower: TowerInstance, ability: TowerAbility, target: EnemyInstance) {
    const ctx: TowerAbilityContext = {
      towerId: tower.id,
      position: tower.coord,
      applyStatus: (_targetId: string, effect: StatusEffect) => {
        if (!this.enemies.includes(target)) return;
        this.applyStatusToEnemy(target, effect);
        this.audio.combat.statusApplied(effect.kind, this.towerElements(tower)[0]);
      },
      dealDamage: (_targetId: string, dmg: DamageInstance) => {
        if (!this.enemies.includes(target)) return;
        if (dmg.element === "physical") {
          const armor = this.effectiveArmor(target);
          target.health -= dmg.amount * (100 / (100 + armor));
        } else {
          this.applyDamage(target, dmg.amount, dmg.element);
        }
      },
      emitVfx: (vfxId: string, worldPos: [number, number, number]) => this.emitAbilityVfx(tower, vfxId, worldPos),
    };
    ability.onTrigger(ctx);
  }

  private emitAbilityVfx(_tower: TowerInstance, vfxId: string, worldPos: [number, number, number]) {
    this.vfx.emitVfx(vfxId, worldPos);
  }

  // -------------------------------------------------------------------
  // Local co-op cursors
  // -------------------------------------------------------------------

  private updateCursors() {
    const rect = this.rendererBundle.renderer.domElement.getBoundingClientRect();
    this.applyCursor("p1", this.input.getCursor("p1"), rect);
    this.applyCursor("p2", this.input.getCursor("p2"), rect);
    this.cursors.setP2Active(this.input.isP2Active());

    const p2 = this.input.getCursor("p2");
    if (p2.actionJustPressed) {
      if (this.victory) this.victoryScreen.el.querySelector<HTMLButtonElement>(".rw-endscreen-restart")?.click();
      else if (this.gameOver) this.defeatScreen.el.querySelector<HTMLButtonElement>(".rw-endscreen-restart")?.click();
      else this.performInteractionAt(p2.ndcX, p2.ndcY);
    }
  }

  private applyCursor(player: PlayerSlot, cursor: CursorState, rect: DOMRect) {
    const x = rect.left + (cursor.ndcX * 0.5 + 0.5) * rect.width;
    const y = rect.top + (1 - (cursor.ndcY * 0.5 + 0.5)) * rect.height;
    this.cursors.setPosition(player, x, y);
    this.cursors.setActionPressed(player, cursor.actionPressed);
  }

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  private checkGameOver() {
    if (this.gameOver || this.victory) return;
    if (this.economy.isGameOver) {
      this.gameOver = true;
      this.defeatScreen.show(this.waveIndex);
      this.audio.music.defeat();
    }
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.rendererBundle.resize(w, h);
  }

  private loop = () => {
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    const dt = rawDt * GAME_SPEED;
    this.elapsed += dt;

    this.input.update();
    this.cameraController.update(rawDt);

    if (!this.gameOver && !this.victory) {
      this.updateWaves();
      this.updateTowers(dt * 1000);
      this.updateEnemies(dt);
    }

    updateTowerVfxTime(this.elapsed);
    this.vfx.update(dt);
    for (const obj of this.tickables) {
      const tick = obj.userData.tick as ((dt: number, elapsed: number) => void) | undefined;
      tick?.(dt, this.elapsed);
    }

    this.updateCursors();
    this.checkGameOver();

    this.rendererBundle.composer.render();
    requestAnimationFrame(this.loop);
  };
}
