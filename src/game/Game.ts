import "@/ui/ui.css";
import { createRenderer2D, type Renderer2DBundle } from "@/core/Renderer2D";
import { TopDownCamera2D } from "@/core/Camera2D";
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
import { getDuplicateFusionRecipe } from "@/game/towers/DuplicateFusionMatrix";
import { getGrandFusionRecipe } from "@/game/towers/GrandFusionMatrix";
import { getEnemyDef } from "@/game/enemies/EnemyRegistry";
import { getWave, TOTAL_WAVES, computeSpawnOrder } from "@/game/enemies/WaveManager";
import { Vfx2D } from "@/game/render2d/Vfx2D";
import { getTowerSprite, TOWER_GROUND_FRAC } from "@/game/render2d/TowerSprites";
import { getEnemySprite, ENEMY_GROUND_FRAC } from "@/game/render2d/EnemySprites";
import { getTileSprite, ROAD_SHADOW, ROAD_DARK, ROAD_BASE, ROAD_LIGHT, ROAD_TREAD } from "@/game/render2d/TileSprites";
import { hashString, mulberry32 } from "@/game/render2d/PixelCanvas";
import { createHUD } from "@/ui/HUD";
import { createShopPanel, type ShopPanel } from "@/ui/ShopPanel";
import { createFusionPanel, type FusionCandidatePair, type FusionPanelApi } from "@/ui/FusionPanel";
import { createTowerInspector, type TowerInspector } from "@/ui/TowerInspector";
import { createCursorIndicators, type CursorIndicators } from "@/ui/CursorIndicators";
import { createVictoryScreen, createDefeatScreen, type EndScreen } from "@/ui/EndScreens";
import { createWavePreview, type PreviewEntry } from "@/ui/WavePreview";
import { createMuteButton } from "@/ui/MuteButton";
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
  shadow: { chance: 0.28, kind: "curse", magnitude: 0.2, durationMs: 2500 },
};

// World-space sizing for sprites — each sprite's logical pixel art is drawn
// at this height in world units, anchored at `groundFrac` down from its top
// so it visually "stands" on its tile instead of floating centered on it.
const TOWER_WORLD_SIZE = 2.05;
const ENEMY_WORLD_SIZE = 1.35;
const BOSS_WORLD_SIZE = 2.5;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface TowerInstance {
  id: string;
  def: TowerDef;
  tier: 1 | 2 | 3;
  coord: GridCoord;
  worldX: number;
  worldY: number;
  cooldownMs: number;
  abilityCooldowns: Map<string, number>;
  goldSpent: number;
  altShot: boolean;
}

interface EnemyInstance {
  id: string;
  def: EnemyDef;
  worldX: number;
  worldY: number;
  waypointIndex: number;
  progress: number;
  health: number;
  maxHealth: number;
  statusEffects: StatusEffect[];
  speedMultiplier: number;
  walkFrame: 0 | 1;
  walkTimer: number;
}

interface QueuedSpawn {
  enemyId: string;
  healthMultiplier: number;
  atElapsed: number;
}

export class Game {
  private renderer2D: Renderer2DBundle;
  private cam: TopDownCamera2D;
  private elapsed = 0;
  private lastTime = performance.now();
  private input: InputManager;
  private host: HTMLElement;
  private hasFramedInitialView = false;

  private map: MapDef;
  private economy = new Economy(STARTING_GOLD, STARTING_LIVES);
  private vfx = new Vfx2D();
  private audio = new AudioSystem();

  /** Ambient dust motes drifting in the backdrop outside the play grid — a
   * fixed set generated once (normalized [0,1] canvas-fraction coordinates
   * so it always covers whatever viewport size) and twinkled in draw() via
   * a cheap per-star sine, instead of a flat single-color fill. */
  private bgMotes = Array.from({ length: 90 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random() * 1.5,
    phase: Math.random() * Math.PI * 2,
    speed: 0.35 + Math.random() * 0.75,
  }));

  /** Small pebble/dirt-fleck texture dots scattered along the curved road
   * (see drawCurvedRoad) — computed once from the map's waypoints with a
   * seeded RNG so they're stable frame to frame instead of re-rolled (and
   * jittering) every draw call. */
  private roadFlecks: { wx: number; wy: number; r: number; color: string }[] = [];

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
    this.host = host;
    this.map = mapId === "map02" ? buildMap02() : buildMap01();
    this.roadFlecks = this.buildRoadFlecks();
    // Game is only ever constructed from inside the StartScreen's map-select
    // click handler, so this synchronous call satisfies the browser's
    // autoplay-gesture requirement.
    void this.audio.unlock().then((ok) => {
      if (ok) this.audio.music.startAmbient();
    });

    this.renderer2D = createRenderer2D(host);
    this.cam = new TopDownCamera2D(host);
    this.input = new InputManager(this.renderer2D.canvas);

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

    const utilityBar = document.createElement("div");
    utilityBar.className = "rw-anchor-utility";
    const wavePreview = createWavePreview({ getEntries: () => this.buildWavePreview() });
    const muteBtn = createMuteButton({ audio: this.audio });
    utilityBar.append(wavePreview.el, muteBtn.el);
    uiRoot.appendChild(utilityBar);

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

    this.renderer2D.canvas.addEventListener("click", (e) => {
      const rect = this.renderer2D.canvas.getBoundingClientRect();
      const [wx, wy] = this.cam.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
      this.performInteractionAt(wx, wy);
    });

    requestAnimationFrame(this.loop);
  }

  // -------------------------------------------------------------------
  // Input / selection
  // -------------------------------------------------------------------

  private handleShopSelect(tower: TowerDef) {
    if (this.armedTowerDefId === tower.id) {
      this.armedTowerDefId = null;
      this.shop.setSelected(null);
      this.audio.ui.click();
      return;
    }
    if (!this.economy.canAfford(tower.tiers[0].cost)) {
      this.audio.ui.denied();
      return;
    }
    this.armedTowerDefId = tower.id;
    this.shop.setSelected(tower.id);
    this.clearSelection();
    this.audio.ui.select();
  }

  private performInteractionAt(wx: number, wy: number) {
    if (this.armedTowerDefId) {
      const coord = this.map.grid.worldToGrid(wx, wy);
      const def = getTowerDef(this.armedTowerDefId);
      if (def) this.tryPlaceTower(coord, def);
      return;
    }

    // A fixed world-space radius shrinks to almost nothing on screen once
    // the player zooms out to see more of the board — 0.9 world units is
    // only ~14px at the camera's min zoom, an easy miss with mouse or
    // finger. Guarantee a comfortable ~22px screen radius at any zoom
    // level instead (floor it at the old 0.9 so close zoom doesn't get
    // *more* trigger-happy than before, only more forgiving when zoomed
    // out). Two adjacent towers' zones can technically overlap at very low
    // zoom, but "closest wins" below already resolves that intuitively.
    const MIN_HIT_RADIUS_PX = 22;
    const HIT_RADIUS = Math.max(0.9, MIN_HIT_RADIUS_PX / this.cam.zoom);
    let closest: TowerInstance | null = null;
    let closestDist = HIT_RADIUS;
    for (const t of this.towers) {
      const d = Math.hypot(t.worldX - wx, t.worldY - wy);
      if (d <= closestDist) {
        closest = t;
        closestDist = d;
      }
    }
    if (closest) {
      this.toggleTowerSelection(closest.id);
      return;
    }
    this.clearSelection();
  }

  private tryPlaceTower(coord: GridCoord, def: TowerDef) {
    const cost = def.tiers[0].cost;
    if (!this.economy.canAfford(cost)) return;
    if (!this.map.grid.isBuildable(coord.x, coord.z)) return;

    const id = `tower-${this.towerIdCounter++}`;
    if (!this.map.grid.placeTower(coord.x, coord.z, id)) return;
    this.economy.spend(cost);

    const [wx, wy] = this.map.grid.gridToWorld(coord);
    this.towers.push({
      id,
      def,
      tier: 1,
      coord,
      worldX: wx,
      worldY: wy,
      cooldownMs: 0,
      abilityCooldowns: new Map(),
      goldSpent: cost,
      altShot: false,
    });

    this.armedTowerDefId = null;
    this.shop.setSelected(null);
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

    // Base + base -> a standard 2-element fusion (the original 21 distinct-
    // pair recipes), or — when both towers share the same element — a
    // same-element "Twin" fusion from DuplicateFusionMatrix.ts instead.
    if (!towerA.def.isFusion && !towerB.def.isFusion) {
      const elA = towerA.def.element as Element;
      const elB = towerB.def.element as Element;
      const recipe = elA === elB ? getDuplicateFusionRecipe(elA) : getFusionRecipe(elA, elB);
      if (!recipe) return [];
      const resultDef = getTowerDef(recipe.resultTowerId);
      if (!resultDef) return [];

      const cost = Math.round(resultDef.tiers[0].cost * FUSION_COST_FACTOR);
      const affordable = this.economy.canAfford(cost);
      return [
        {
          id: recipe.resultTowerId,
          towerA: { id: towerA.id, name: towerA.def.name, element: elA },
          towerB: { id: towerB.id, name: towerB.def.name, element: elB },
          resultName: resultDef.name,
          resultElementPair: resultDef.element as FusionElementPair,
          flavorText: resultDef.flavorText,
          cost,
          affordable,
          goldShortfall: affordable ? undefined : cost - this.economy.gold,
        },
      ];
    }

    // Fusion + base (a third, distinct element) -> a curated Grand Fusion.
    const fusionTower = towerA.def.isFusion ? towerA : towerB.def.isFusion ? towerB : null;
    const baseTower = fusionTower === towerA ? towerB : towerA;
    if (!fusionTower || baseTower.def.isFusion) return [];

    const [fA, fB] = this.towerElements(fusionTower);
    const thirdElement = baseTower.def.element as Element;
    if (!fB) return [];
    // No eligibility restriction on the third element at all — path-
    // agnostic by design: Steamcaller(fire+ice)+fire and Twin Ember(fire+
    // fire)+ice both represent the same "2 fire + 1 ice" combination and
    // must both resolve to the same result, regardless of which order the
    // player assembled it in. Whether a given (parent, third) pairing is
    // actually a real combination is entirely GrandFusionMatrix.ts's job —
    // it's the recipe lookup below, not this eligibility check, that gates
    // validity.
    const recipe = getGrandFusionRecipe(fusionTower.def.id, thirdElement);
    if (!recipe) return [];
    const resultDef = getTowerDef(recipe.resultTowerId);
    if (!resultDef) return [];

    const cost = Math.round(resultDef.tiers[0].cost * FUSION_COST_FACTOR);
    const affordable = this.economy.canAfford(cost);
    return [
      {
        id: recipe.resultTowerId,
        towerA: { id: fusionTower.id, name: fusionTower.def.name, element: fA },
        towerB: { id: baseTower.id, name: baseTower.def.name, element: thirdElement },
        resultName: resultDef.name,
        resultElementPair: resultDef.element as FusionElementPair,
        flavorText: resultDef.flavorText,
        cost,
        affordable,
        goldShortfall: affordable ? undefined : cost - this.economy.gold,
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
    this.map.grid.removeTower(towerA.coord.x, towerA.coord.z);
    this.map.grid.removeTower(towerB.coord.x, towerB.coord.z);
    this.towers = this.towers.filter((t) => t !== towerA && t !== towerB);

    const id = `tower-${this.towerIdCounter++}`;
    this.map.grid.placeTower(coord.x, coord.z, id);
    const [wx, wy] = this.map.grid.gridToWorld(coord);

    this.towers.push({
      id,
      def: resultDef,
      tier: 1,
      coord,
      worldX: wx,
      worldY: wy,
      cooldownMs: 0,
      abilityCooldowns: new Map(),
      goldSpent: (candidate.cost ?? 0) + towerA.goldSpent + towerB.goldSpent,
      altShot: false,
    });

    this.vfx.impactsApi.triggerFusion(candidate.towerA.element, candidate.towerB.element, [wx, 0, wy]);
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

    this.inspector.show(this.buildInspectorInfo(tower));
    this.audio.combat.towerUpgraded();
  }

  private handleSell() {
    const tower = this.towers.find((t) => t.id === this.selectedTowerIds[0]);
    if (!tower) return;
    this.economy.earn(Math.round(tower.goldSpent * SELL_REFUND_FACTOR));
    this.map.grid.removeTower(tower.coord.x, tower.coord.z);
    this.towers = this.towers.filter((t) => t !== tower);
    this.clearSelection();
    this.audio.combat.towerSold();
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

    this.spawnQueue = computeSpawnOrder(wave).map((e) => ({
      enemyId: e.enemyId,
      healthMultiplier: e.healthMultiplier,
      atElapsed: this.elapsed + e.offsetMs / 1000,
    }));
  }

  /** The "next wave" is always waveIndex + 1 — waveIndex only advances when
   * a wave actually starts, so this is correct whether the current wave is
   * still spawning, fully cleared and waiting on the between-wave timer, or
   * the game hasn't started its first wave yet (waveIndex 0 -> next is 1).
   * Reuses WaveManager's own spawn-order math so the preview can never
   * drift out of sync with what actually spawns. */
  private buildWavePreview(): PreviewEntry[] {
    const wave = getWave(this.waveIndex + 1);
    if (!wave) return [];
    return computeSpawnOrder(wave).map((e) => {
      const def = getEnemyDef(e.enemyId);
      return { enemyId: e.enemyId, name: def.name, movement: def.movement, isBoss: e.isBoss };
    });
  }

  private spawnEnemy(enemyId: string, healthMultiplier: number) {
    const def = getEnemyDef(enemyId);
    const spawn = this.map.waypoints[0];
    const [wx, wy] = this.map.grid.gridToWorld(spawn);
    const health = Math.round(def.baseHealth * healthMultiplier);

    this.enemies.push({
      id: `enemy-${this.enemyIdCounter++}`,
      def,
      worldX: wx,
      worldY: wy,
      waypointIndex: 0,
      progress: 0,
      health,
      maxHealth: health,
      statusEffects: [],
      speedMultiplier: 1,
      walkFrame: 0,
      walkTimer: 0,
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
      const [ax, ay] = this.map.grid.gridToWorld(a);
      const [bx, by] = this.map.grid.gridToWorld(b);
      enemy.worldX = lerp(ax, bx, enemy.progress);
      enemy.worldY = lerp(ay, by, enemy.progress);

      if (effectiveSpeed > 0.01) {
        enemy.walkTimer += dt;
        if (enemy.walkTimer > 0.16) {
          enemy.walkTimer = 0;
          enemy.walkFrame = enemy.walkFrame === 0 ? 1 : 0;
        }
      }
    }
  }

  private updateStatusEffects(enemy: EnemyInstance, dtSeconds: number) {
    const now = Date.now();
    enemy.statusEffects = enemy.statusEffects.filter((e) => now - e.appliedAt < e.durationMs);

    // Each kind now occupies its own tactical niche instead of a handful of
    // status names sharing the same handful of mechanics:
    //  - chill: sustained PARTIAL slow, scales with magnitude — the "always
    //    somewhat useful" crowd-thinning tool.
    //  - shock / freeze: full stop (speedMult 0) — shock is the brief
    //    version (short durations already authored across its abilities),
    //    freeze the longer capstone-tier version. Same bucket, different
    //    durations give them a real "quick interrupt" vs "hard lockdown"
    //    feel without needing separate code paths.
    //  - root: also a full stop, but GROUND-ONLY — it can't grab something
    //    that's flying, unlike freeze/shock, so it's the ground-rush
    //    counter rather than a universal CC.
    //  - burn: flat, no-frills DOT — fire's identity is raw damage.
    //  - poison: DOT that also spreads to nearby enemies when the carrier
    //    dies (see the contagion check in killEnemy/removeEnemy below) —
    //    nature's identity is crowd control against clustered waves, not
    //    single-target damage.
    let speedMult = 1;
    for (const effect of enemy.statusEffects) {
      if (effect.kind === "chill") speedMult *= 1 - effect.magnitude;
      if (effect.kind === "shock" || effect.kind === "freeze") speedMult = 0;
      if (effect.kind === "root" && enemy.def.movement !== "flying") speedMult = 0;
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

  /** Curse doesn't reduce armor like sunder — it's a flat "all damage from
   * every source lands harder" multiplier, so it stacks additively on top
   * of whatever the target's armor already lets through. */
  private effectiveCurseMultiplier(enemy: EnemyInstance): number {
    const curse = enemy.statusEffects.find((e) => e.kind === "curse");
    return curse ? 1 + curse.magnitude : 1;
  }

  private removeEnemy(enemy: EnemyInstance) {
    this.enemies = this.enemies.filter((e) => e !== enemy);
  }

  private killEnemy(enemy: EnemyInstance) {
    this.spreadPoisonOnDeath(enemy);
    this.economy.earn(Math.round(enemy.def.bounty * BOUNTY_MULTIPLIER));
    this.removeEnemy(enemy);
    this.audio.combat.enemyDeath(enemy.def.isBoss ?? false);
  }

  /** Poison's real identity: a dying poisoned enemy pops its infection onto
   * anything else still standing nearby, carrying the same magnitude/
   * duration forward. Against a clustered wave this chains — kill one,
   * infect its neighbors, they die and infect theirs — turning a single
   * poison application into sustained area control instead of a one-off
   * DOT, which is what actually separates poison from burn's flat damage. */
  private spreadPoisonOnDeath(enemy: EnemyInstance) {
    const poison = enemy.statusEffects.find((e) => e.kind === "poison");
    if (!poison) return;
    const radius = 1.8;
    for (const other of this.enemies) {
      if (other === enemy || other.health <= 0) continue;
      const d = Math.hypot(other.worldX - enemy.worldX, other.worldY - enemy.worldY);
      if (d > radius) continue;
      this.applyStatusToEnemy(other, { ...poison, appliedAt: Date.now() });
      this.vfx.emitVfx("vfx.nature.poison_spread", [other.worldX, 0, other.worldY], "poison");
    }
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
    const inRange = this.enemies.filter(
      (e) => Math.hypot(e.worldX - tower.worldX, e.worldY - tower.worldY) <= stats.range,
    );
    if (inRange.length === 0) return null;

    const progress = (e: EnemyInstance) => e.waypointIndex + e.progress;
    const dist = (e: EnemyInstance) => Math.hypot(e.worldX - tower.worldX, e.worldY - tower.worldY);

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
      const target = this.pickTarget(tower);

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

  /** Same "how many elements does this tower's id encode" convention
   * TowerSprites.ts uses to detect Grand Fusion towers (def.element only
   * ever exposes 2 of a Grand Fusion's 3 elements, so the id is the only
   * reliable signal) — reused here so bullet VFX richness (base < fusion <
   * grand) lines up with the same category the tower's own sprite uses. */
  private towerCategory(tower: TowerInstance): "base" | "fusion" | "grand" {
    if (!tower.def.isFusion) return "base";
    const idTail = tower.def.id.replace(/^tower_/, "");
    return idTail.split("_").length >= 3 ? "grand" : "fusion";
  }

  /** Picks the status kind shown as a small motif on the tower's bullets —
   * the highest-tier ability unlocked at the tower's current tier that
   * actually carries a statusKind, so the accent always reflects an effect
   * the tower can presently land (not a capstone ability still locked). */
  private primaryStatusAccent(tower: TowerInstance): StatusEffectKind | null {
    let picked: StatusEffectKind | null = null;
    let pickedTier = -1;
    for (const ability of tower.def.abilities) {
      const minTier = ability.minTier ?? 1;
      if (tower.tier < minTier || !ability.statusKind) continue;
      if (minTier >= pickedTier) {
        picked = ability.statusKind;
        pickedTier = minTier;
      }
    }
    return picked;
  }

  private fireProjectile(tower: TowerInstance, target: EnemyInstance) {
    const [elA, elB] = this.towerElements(tower);
    tower.altShot = !tower.altShot;
    const element = elB && tower.altShot ? elB : elA;
    // The "other" element for the bullet's secondary accent — the element
    // NOT currently firing, so an alternating fusion shot doesn't show the
    // same color twice (elA firing -> accent elB, and vice versa).
    const otherElement = elB ? (element === elA ? elB : elA) : undefined;
    const stats = this.currentTierDef(tower).stats;
    const fromPos: [number, number, number] = [tower.worldX, 0, tower.worldY];

    this.vfx.projectilesApi.spawn(element, fromPos, () => [target.worldX, 0, target.worldY], {
      speed: stats.projectileSpeed,
      elementB: otherElement,
      tier: tower.tier,
      category: this.towerCategory(tower),
      statusAccent: this.primaryStatusAccent(tower),
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
    let isCrit = false;

    if (this.enemies.includes(target)) {
      isCrit = this.applyDamage(target, baseDamage, elA, critChance, critMultiplier);
      this.tryApplyOnHitProc(target, tower, elA);
    }

    if (elB) {
      this.vfx.impactsApi.triggerFusion(elA, elB, pos, isCrit);
    } else {
      this.vfx.impactsApi.trigger(elA, pos, isCrit);
    }
    this.playThrottled(`impact:${elA}`, 60, () => this.audio.combat.impact(elA, pos));

    if (splashRadius) {
      for (const enemy of this.enemies) {
        if (enemy === target) continue;
        if (Math.hypot(enemy.worldX - pos[0], enemy.worldY - pos[2]) <= splashRadius) {
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
    const rawMult = enemy.def.resistances[element] ?? enemy.def.weaknesses[element] ?? 1;
    // Silence's real identity: it strips the enemy's innate elemental
    // RESISTANCE while active (rawMult < 1 becomes 1, full damage gets
    // through) but doesn't touch an exploited WEAKNESS bonus (rawMult > 1
    // stays as-is) — "suppressing defenses" makes sense, silencing away a
    // weakness the player is already benefiting from wouldn't. This gives
    // arcane's signature status a real answer to the specialized-resistance
    // enemies later waves lean on, distinct from sunder (armor) and curse
    // (a flat damage-taken multiplier stacking on top of both).
    const silenced = enemy.statusEffects.some((e) => e.kind === "silence");
    const mult = silenced && rawMult < 1 ? 1 : rawMult;
    let dmg = baseDamage * mult;
    const isCrit = !!(critChance && critMultiplier && Math.random() < critChance);
    if (isCrit) dmg *= critMultiplier!;
    const armor = this.effectiveArmor(enemy);
    dmg *= 100 / (100 + armor);
    dmg *= this.effectiveCurseMultiplier(enemy);
    enemy.health -= dmg;
    return isCrit;
  }

  private triggerAbility(tower: TowerInstance, ability: TowerAbility, target: EnemyInstance) {
    const ctx: TowerAbilityContext = {
      towerId: tower.id,
      position: tower.coord,
      worldPosition: [tower.worldX, 0, tower.worldY],
      applyStatus: (_targetId: string, effect: StatusEffect) => {
        if (!this.enemies.includes(target)) return;
        this.applyStatusToEnemy(target, effect);
        this.audio.combat.statusApplied(effect.kind, this.towerElements(tower)[0]);
      },
      dealDamage: (_targetId: string, dmg: DamageInstance) => {
        if (!this.enemies.includes(target)) return;
        if (dmg.element === "physical") {
          const armor = this.effectiveArmor(target);
          target.health -= dmg.amount * (100 / (100 + armor)) * this.effectiveCurseMultiplier(target);
        } else {
          this.applyDamage(target, dmg.amount, dmg.element);
        }
      },
      emitVfx: (vfxId: string, worldPos: [number, number, number], statusKind?: StatusEffectKind) =>
        this.vfx.emitVfx(vfxId, worldPos, statusKind),
    };
    ability.onTrigger(ctx);
  }

  // -------------------------------------------------------------------
  // Local co-op cursors
  // -------------------------------------------------------------------

  private updateCursors() {
    const rect = this.renderer2D.canvas.getBoundingClientRect();
    this.applyCursor("p1", this.input.getCursor("p1"), rect);
    this.applyCursor("p2", this.input.getCursor("p2"), rect);
    this.cursors.setP1Active(!this.input.isP1Touch());
    this.cursors.setP2Active(this.input.isP2Active());

    const p2 = this.input.getCursor("p2");
    if (p2.actionJustPressed) {
      if (this.victory) this.victoryScreen.el.querySelector<HTMLButtonElement>(".rw-endscreen-restart")?.click();
      else if (this.gameOver) this.defeatScreen.el.querySelector<HTMLButtonElement>(".rw-endscreen-restart")?.click();
      else {
        const [wx, wy] = this.cam.screenToWorld(
          (p2.ndcX * 0.5 + 0.5) * rect.width,
          (1 - (p2.ndcY * 0.5 + 0.5)) * rect.height,
          rect.width,
          rect.height,
        );
        this.performInteractionAt(wx, wy);
      }
    }
  }

  private applyCursor(player: PlayerSlot, cursor: CursorState, rect: DOMRect) {
    const x = rect.left + (cursor.ndcX * 0.5 + 0.5) * rect.width;
    const y = rect.top + (1 - (cursor.ndcY * 0.5 + 0.5)) * rect.height;
    this.cursors.setPosition(player, x, y);
    this.cursors.setActionPressed(player, cursor.actionPressed);
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------

  /** Walks every waypoint segment and scatters a handful of small pebble/
   * dirt-fleck dots (perpendicular-jittered within the road's width) along
   * it, seeded deterministically off the segment index so re-running this
   * always produces the same scatter for a given map. */
  private buildRoadFlecks(): { wx: number; wy: number; r: number; color: string }[] {
    const wps = this.map.waypoints;
    const cellSize = this.map.grid.cellSize;
    const roadHalfWidth = cellSize * 0.36;
    const flecks: { wx: number; wy: number; r: number; color: string }[] = [];
    const colors = [ROAD_DARK, ROAD_TREAD, ROAD_SHADOW];
    for (let i = 0; i < wps.length - 1; i++) {
      const [ax, ay] = this.map.grid.gridToWorld(wps[i]);
      const [bx, by] = this.map.grid.gridToWorld(wps[i + 1]);
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const rng = mulberry32(7000 + i * 131);
      const count = 2;
      for (let f = 0; f < count; f++) {
        const t = (f + 0.5) / count;
        const perp = (rng() - 0.5) * roadHalfWidth * 1.4;
        flecks.push({
          wx: ax + dx * t + nx * perp,
          wy: ay + dy * t + ny * perp,
          r: 0.05 + rng() * 0.07,
          color: colors[Math.floor(rng() * colors.length)],
        });
      }
    }
    return flecks;
  }

  /** Strokes the map's waypoint list as one continuous ribbon (round joins
   * and caps at every turn) instead of the old blocky per-cell cobblestone
   * tiles, so the road reads as an actual curve at corners — matching the
   * "sunny meadow" reference's smooth dirt path rather than a right-angle
   * stair-step of square tiles. Drawn over the grass tiles the main tile
   * loop already placed under every path cell. */
  private drawCurvedRoad(ctx: CanvasRenderingContext2D, vw: number, vh: number, cellSize: number) {
    const wps = this.map.waypoints;
    if (wps.length < 2) return;

    const screenPts = wps.map((c) => {
      const [wx, wy] = this.map.grid.gridToWorld(c);
      return this.cam.worldToScreen(wx, wy, vw, vh);
    });

    const roadWidth = cellSize * this.cam.zoom * 0.84;

    const strokePolyline = (width: number, color: string, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(screenPts[0][0], screenPts[0][1]);
      for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i][0], screenPts[i][1]);
      ctx.stroke();
      ctx.restore();
    };

    // Soft dark edge halo grounding the road against the grass, then the
    // main dirt fill, then a lighter worn-tread strip down the center.
    strokePolyline(roadWidth + 5 * (this.cam.zoom / 30), ROAD_SHADOW, 0.45);
    strokePolyline(roadWidth, ROAD_BASE, 1);
    strokePolyline(roadWidth * 0.5, ROAD_LIGHT, 0.5);

    for (const fleck of this.roadFlecks) {
      const [sx, sy] = this.cam.worldToScreen(fleck.wx, fleck.wy, vw, vh);
      ctx.fillStyle = fleck.color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(sx, sy, fleck.r * this.cam.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Draws the spawn/base portal glow at its two fixed map positions, on
   * top of the grass + curved road (see drawCurvedRoad) rather than as a
   * full per-cell tile — portalTile()'s art no longer paints an opaque
   * square background, so this reads as a round glow sitting at the road's
   * end instead of a hard-edged tile clashing with the rounded cap there. */
  private drawPortals(ctx: CanvasRenderingContext2D, vw: number, vh: number, cellSize: number) {
    const drawSize = cellSize * this.cam.zoom;
    for (const [coord, kind] of [
      [this.map.spawn, "spawn"],
      [this.map.base, "base"],
    ] as const) {
      const [wx, wy] = this.map.grid.gridToWorld(coord);
      const [sx, sy] = this.cam.worldToScreen(wx, wy, vw, vh);
      if (sx < -drawSize || sx > vw + drawSize || sy < -drawSize || sy > vh + drawSize) continue;
      const variant = hashString(`${coord.x},${coord.z}`);
      const sprite = getTileSprite(kind, variant);
      ctx.drawImage(sprite, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
    }
  }

  /** Backdrop drawn behind the grid (and visible around it whenever the map
   * doesn't fill the viewport) — a soft dark-forest radial vignette plus a
   * field of slowly twinkling gold pollen motes, matching the sunny-meadow
   * tone of the tile art (TileSprites.ts) instead of clashing against it
   * with an unrelated cosmic-void backdrop. Cheap: one gradient plus ~90
   * small circles, no per-pixel work. */
  private drawBackdrop(ctx: CanvasRenderingContext2D, vw: number, vh: number) {
    const grad = ctx.createRadialGradient(vw / 2, vh / 2, 0, vw / 2, vh / 2, Math.max(vw, vh) * 0.78);
    grad.addColorStop(0, "#1c3018");
    grad.addColorStop(0.55, "#122210");
    grad.addColorStop(1, "#08120a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);

    const t = this.elapsed;
    for (const m of this.bgMotes) {
      const alpha = 0.1 + 0.28 * (0.5 + 0.5 * Math.sin(t * m.speed + m.phase));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#e8d98a";
      ctx.beginPath();
      ctx.arc(m.x * vw, m.y * vh, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private draw() {
    const { ctx, width: vw, height: vh } = this.renderer2D;
    this.drawBackdrop(ctx, vw, vh);

    const cellSize = this.map.grid.cellSize;
    const halfCell = cellSize / 2;

    // Tiles — culled to the visible viewport (grid is small, but this keeps
    // the draw loop cheap regardless of zoom/pan).
    for (const cell of this.map.grid.allCells()) {
      const [wx, wy] = this.map.grid.gridToWorld(cell);
      const [sx, sy] = this.cam.worldToScreen(wx, wy, vw, vh);
      const drawSize = cellSize * this.cam.zoom;
      if (sx < -drawSize || sx > vw + drawSize || sy < -drawSize || sy > vh + drawSize) continue;

      const variant = hashString(`${cell.x},${cell.z}`);
      // Every cell gets continuous grass as its base layer now — path,
      // spawn/base, and blocked cells each used to be a fully separate
      // opaque tile, which always left a hard square edge wherever that
      // tile's silhouette didn't fill its cell (a rounded road cap, a
      // circular portal glow, an irregular boulder cluster). Each of those
      // kinds now draws its actual art as a transparent-background overlay
      // instead: drawCurvedRoad()/drawPortals() below handle path/spawn/
      // base as their own passes (they aren't confined to one cell), and
      // "blocked" draws its rock-cluster overlay right here since it's a
      // simple single-cell decoration.
      const grassSprite = getTileSprite("buildable", variant);
      ctx.drawImage(grassSprite, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
      if (cell.kind === "blocked") {
        const rockSprite = getTileSprite("blocked", variant);
        ctx.drawImage(rockSprite, sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
      }

      // Mowed-lawn diagonal banding — a very faint tint over every other
      // wide diagonal stripe of grass (kept subtle and slow-changing on
      // purpose: a stronger/tighter version of this tiled across a whole
      // viewport read as flicker during play, not the gentle "mowed lawn"
      // sweep it reads as in a single reference screenshot). Keyed off
      // grid coords, not screen space, so it stays stable across zoom/pan.
      // Only shown on plain buildable ground — path/portal/rocks draw a
      // fully opaque overlay over it anyway, so it'd be wasted work there.
      if (cell.kind === "buildable") {
        const band = Math.floor((cell.x + cell.z) / 6);
        if ((((band % 2) + 2) % 2) === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.035)";
          ctx.fillRect(sx - drawSize / 2, sy - drawSize / 2, drawSize, drawSize);
        }
      }

      if (this.armedTowerDefId && cell.kind === "buildable" && !cell.occupiedByTowerId) {
        ctx.strokeStyle = "rgba(255,210,122,0.75)";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx - drawSize / 2 + 2, sy - drawSize / 2 + 2, drawSize - 4, drawSize - 4);
      }
    }

    this.drawCurvedRoad(ctx, vw, vh, cellSize);
    this.drawPortals(ctx, vw, vh, cellSize);

    void halfCell;

    // Entities — depth-sorted by world Y (screen "down") so overlapping
    // sprites read correctly regardless of draw order.
    type DrawItem = { y: number; draw: () => void };
    const items: DrawItem[] = [];

    for (const tower of this.towers) {
      items.push({
        y: tower.worldY,
        draw: () => {
          const sprite = getTowerSprite(tower.def, tower.tier);
          const drawSize = TOWER_WORLD_SIZE * this.cam.zoom;
          const [sx, sy] = this.cam.worldToScreen(tower.worldX, tower.worldY, vw, vh);
          ctx.drawImage(sprite, sx - drawSize / 2, sy - drawSize * TOWER_GROUND_FRAC, drawSize, drawSize);
          if (this.selectedTowerIds.includes(tower.id)) {
            ctx.strokeStyle = "#ffe27a";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, halfCell * this.cam.zoom * 0.95, 0, Math.PI * 2);
            ctx.stroke();
          }
        },
      });
    }

    for (const enemy of this.enemies) {
      items.push({
        y: enemy.worldY,
        draw: () => {
          const sprite = getEnemySprite(enemy.def, enemy.walkFrame);
          const worldSize = enemy.def.isBoss ? BOSS_WORLD_SIZE : ENEMY_WORLD_SIZE;
          const drawSize = worldSize * this.cam.zoom;
          const [sx, sy] = this.cam.worldToScreen(enemy.worldX, enemy.worldY, vw, vh);
          ctx.drawImage(sprite, sx - drawSize / 2, sy - drawSize * ENEMY_GROUND_FRAC, drawSize, drawSize);
          this.drawHealthBar(ctx, sx, sy - drawSize * ENEMY_GROUND_FRAC - 5, enemy);
          this.drawStatusIcons(ctx, sx, sy - drawSize * ENEMY_GROUND_FRAC - 12, enemy);
        },
      });
    }

    items.sort((a, b) => a.y - b.y);
    for (const item of items) item.draw();

    this.vfx.draw(ctx, this.cam, vw, vh);
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D, cx: number, topY: number, enemy: EnemyInstance) {
    const w = enemy.def.isBoss ? 46 : 24;
    const h = enemy.def.isBoss ? 6 : 4;
    const frac = Math.max(0, enemy.health / enemy.maxHealth);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(cx - w / 2, topY, w, h);
    ctx.fillStyle = enemy.def.isBoss ? "#ffb14d" : "#4dff88";
    ctx.fillRect(cx - w / 2, topY, w * frac, h);
  }

  private static readonly STATUS_COLOR: Partial<Record<StatusEffectKind, string>> = {
    burn: "#ff7a3d",
    chill: "#7ad4ff",
    freeze: "#c9f2ff",
    shock: "#f5e642",
    root: "#8bd97a",
    poison: "#b06bff",
    sunder: "#d9b98a",
    silence: "#e2c2ff",
    curse: "#8b6fd6",
  };

  private drawStatusIcons(ctx: CanvasRenderingContext2D, cx: number, topY: number, enemy: EnemyInstance) {
    if (enemy.statusEffects.length === 0) return;
    const r = 2.5;
    const spacing = 7;
    const startX = cx - ((enemy.statusEffects.length - 1) * spacing) / 2;
    enemy.statusEffects.forEach((effect, i) => {
      ctx.fillStyle = Game.STATUS_COLOR[effect.kind] ?? "#ffffff";
      ctx.beginPath();
      ctx.arc(startX + i * spacing, topY, r, 0, Math.PI * 2);
      ctx.fill();
    });
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
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer2D.resize(w, h);

    if (!this.hasFramedInitialView) {
      this.hasFramedInitialView = true;
      const mapW = this.map.grid.width * this.map.grid.cellSize;
      const mapH = this.map.grid.height * this.map.grid.cellSize;
      this.cam.zoom = Math.max(
        this.cam.minZoom,
        Math.min(this.cam.maxZoom, Math.min(w / (mapW * 1.15), h / (mapH * 1.15))),
      );
    }
  }

  private loop = () => {
    const now = performance.now();
    const rawDt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    const dt = rawDt * GAME_SPEED;
    this.elapsed += dt;

    this.input.update();

    if (!this.gameOver && !this.victory) {
      this.updateWaves();
      this.updateTowers(dt * 1000);
      this.updateEnemies(dt);
    }

    this.vfx.update(dt);
    this.updateCursors();
    this.checkGameOver();

    this.draw();
    requestAnimationFrame(this.loop);
  };
}
