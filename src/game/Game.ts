import * as THREE from "three";
import { createRenderer } from "@/core/Renderer";
import { createCamera, RtsCameraController } from "@/core/Camera";
import { createLightingRig } from "@/core/Lighting";
import { createSkybox } from "@/game/world/Skybox";
import { createTerrain } from "@/game/world/Terrain";
import { buildMap01 } from "@/game/world/Map01";
import { Economy } from "@/game/economy/Economy";
import { InputManager } from "@/game/input/InputManager";
import type { GridCoord } from "@/game/types";

interface PlaceholderTower {
  id: string;
  mesh: THREE.Group;
  coord: GridCoord;
  range: number;
  fireRateMs: number;
  cooldown: number;
  damage: number;
}

interface PlaceholderEnemy {
  id: string;
  mesh: THREE.Mesh;
  waypointIndex: number;
  progress: number; // 0..1 along current segment
  speed: number; // cells per second
  health: number;
  maxHealth: number;
  healthBarFg: THREE.Mesh;
}

interface Projectile {
  mesh: THREE.Mesh;
  target: PlaceholderEnemy;
  speed: number;
  damage: number;
}

const TOWER_COLOR = 0xff7a3c;

export class Game {
  private scene = new THREE.Scene();
  private camera = createCamera(window.innerWidth / window.innerHeight);
  private cameraController: RtsCameraController;
  private rendererBundle: ReturnType<typeof createRenderer>;
  private clock = new THREE.Clock();
  private input: InputManager;
  private raycaster = new THREE.Raycaster();

  private map = buildMap01();
  private economy = new Economy(150, 20);

  private towers: PlaceholderTower[] = [];
  private enemies: PlaceholderEnemy[] = [];
  private projectiles: Projectile[] = [];
  private towerId = 0;
  private enemyId = 0;
  private spawnTimer = 0;
  private spawnInterval = 1.4;
  private enemiesToSpawn = 8;
  private ground: THREE.Mesh;
  private cellMarkers: THREE.Mesh[] = [];

  private hudEl: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.scene.background = new THREE.Color(0x120a1f);
    this.scene.add(createSkybox());
    createLightingRig(this.scene);

    this.cameraController = new RtsCameraController(this.camera, host);
    this.rendererBundle = createRenderer(host, this.scene, this.camera);
    this.input = new InputManager(this.rendererBundle.renderer.domElement);

    this.ground = createTerrain(this.map.grid);
    this.scene.add(this.ground);

    this.addBuildableMarkers();

    this.hudEl = document.createElement("div");
    this.hudEl.className = "hud";
    host.appendChild(this.hudEl);
    this.economy.subscribe((s) => {
      this.hudEl.textContent = `Gold: ${s.gold}   Lives: ${s.lives}   Wave: ${s.wave}`;
    });

    window.addEventListener("resize", () => this.onResize());
    this.onResize();

    this.rendererBundle.renderer.domElement.addEventListener("click", (e) =>
      this.handleClick(e),
    );

    requestAnimationFrame(this.loop);
  }

  private addBuildableMarkers() {
    // Visual ring (decorative only — its hole means it can't be the raycast
    // target, or clicking the intuitive center of a tile would miss it).
    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });

    // Invisible full-tile hit area used for raycasting/placement.
    const hitGeo = new THREE.CircleGeometry(0.95, 16);
    hitGeo.rotateX(-Math.PI / 2);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    for (const cell of this.map.grid.allCells()) {
      if (cell.kind !== "buildable") continue;
      const [wx, wz] = this.map.grid.gridToWorld(cell);

      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(wx, 0.06, wz);
      this.scene.add(ring);

      const hitArea = new THREE.Mesh(hitGeo, hitMat);
      hitArea.position.set(wx, 0.06, wz);
      hitArea.userData.gridCoord = { x: cell.x, z: cell.z };
      this.scene.add(hitArea);
      this.cellMarkers.push(hitArea);
    }
  }

  private handleClick(e: MouseEvent) {
    const rect = this.rendererBundle.renderer.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = this.raycaster.intersectObjects(this.cellMarkers);
    if (hits.length === 0) return;
    const coord = hits[0].object.userData.gridCoord as GridCoord;
    this.tryPlaceTower(coord);
  }

  private tryPlaceTower(coord: GridCoord) {
    const cost = 25;
    if (!this.economy.canAfford(cost)) return;
    if (!this.map.grid.isBuildable(coord.x, coord.z)) return;

    const id = `tower-${this.towerId++}`;
    if (!this.map.grid.placeTower(coord.x, coord.z, id)) return;
    this.economy.spend(cost);

    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.5, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x33263f, roughness: 0.6 }),
    );
    base.position.y = 0.2;
    base.castShadow = true;
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.9, 6),
      new THREE.MeshStandardMaterial({
        color: TOWER_COLOR,
        emissive: new THREE.Color(TOWER_COLOR).multiplyScalar(0.4),
        roughness: 0.35,
        metalness: 0.2,
      }),
    );
    spire.position.y = 0.85;
    spire.castShadow = true;
    group.add(base, spire);

    const [wx, wz] = this.map.grid.gridToWorld(coord);
    group.position.set(wx, 0, wz);
    this.scene.add(group);

    this.towers.push({
      id,
      mesh: group,
      coord,
      range: 4.5,
      fireRateMs: 550,
      cooldown: 0,
      damage: 14,
    });
  }

  private spawnEnemy() {
    const id = `enemy-${this.enemyId++}`;
    const geo = new THREE.IcosahedronGeometry(0.35, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a3fd9,
      emissive: 0x2a0f4a,
      roughness: 0.4,
      metalness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;

    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    barBg.position.y = 0.6;
    const barFg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.58, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x4dff88 }),
    );
    barFg.position.y = 0.601;
    mesh.add(barBg, barFg);

    const start = this.map.waypoints[0];
    const [wx, wz] = this.map.grid.gridToWorld(start);
    mesh.position.set(wx, 0.35, wz);
    this.scene.add(mesh);

    const health = 60;
    this.enemies.push({
      id,
      mesh,
      waypointIndex: 0,
      progress: 0,
      speed: 1.6,
      health,
      maxHealth: health,
      healthBarFg: barFg,
    });
  }

  private updateEnemies(dt: number) {
    for (const enemy of [...this.enemies]) {
      const wps = this.map.waypoints;
      if (enemy.waypointIndex >= wps.length - 1) {
        this.removeEnemy(enemy, false);
        this.economy.loseLife(1);
        continue;
      }
      enemy.progress += (enemy.speed * dt) / this.map.grid.cellSize;
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
      enemy.mesh.position.set(x, 0.35 + Math.sin(performance.now() * 0.005) * 0.03, z);
      enemy.mesh.lookAt(bx, 0.35, bz);

      const hpFrac = Math.max(0, enemy.health / enemy.maxHealth);
      enemy.healthBarFg.scale.x = hpFrac;
      enemy.healthBarFg.position.x = -0.29 * (1 - hpFrac);
    }
  }

  private updateTowers(dtMs: number) {
    for (const tower of this.towers) {
      tower.cooldown -= dtMs;
      if (tower.cooldown > 0) continue;
      const [twx, twz] = this.map.grid.gridToWorld(tower.coord);
      let target: PlaceholderEnemy | null = null;
      let bestProgress = -1;
      for (const enemy of this.enemies) {
        const dx = enemy.mesh.position.x - twx;
        const dz = enemy.mesh.position.z - twz;
        const dist = Math.hypot(dx, dz);
        if (dist <= tower.range) {
          const overallProgress = enemy.waypointIndex + enemy.progress;
          if (overallProgress > bestProgress) {
            bestProgress = overallProgress;
            target = enemy;
          }
        }
      }
      if (target) {
        this.fireProjectile(tower, target);
        tower.cooldown = tower.fireRateMs;
      }
    }
  }

  private fireProjectile(tower: PlaceholderTower, target: PlaceholderEnemy) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 8),
      new THREE.MeshBasicMaterial({ color: TOWER_COLOR }),
    );
    mesh.position.copy(tower.mesh.position).setY(0.9);
    this.scene.add(mesh);
    this.projectiles.push({ mesh, target, speed: 9, damage: tower.damage });
  }

  private updateProjectiles(dt: number) {
    for (const proj of [...this.projectiles]) {
      if (!this.enemies.includes(proj.target)) {
        this.removeProjectile(proj);
        continue;
      }
      const dir = new THREE.Vector3().subVectors(
        proj.target.mesh.position,
        proj.mesh.position,
      );
      const dist = dir.length();
      if (dist < 0.25) {
        proj.target.health -= proj.damage;
        this.removeProjectile(proj);
        if (proj.target.health <= 0) {
          this.economy.earn(6);
          this.removeEnemy(proj.target, true);
        }
        continue;
      }
      dir.normalize();
      proj.mesh.position.addScaledVector(dir, proj.speed * dt);
    }
  }

  private removeEnemy(enemy: PlaceholderEnemy, _killed: boolean) {
    this.scene.remove(enemy.mesh);
    this.enemies = this.enemies.filter((e) => e !== enemy);
  }

  private removeProjectile(proj: Projectile) {
    this.scene.remove(proj.mesh);
    this.projectiles = this.projectiles.filter((p) => p !== proj);
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.rendererBundle.resize(w, h);
  }

  private loop = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update();
    this.cameraController.update(dt);

    if (this.enemiesToSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spawnInterval;
        this.spawnEnemy();
        this.enemiesToSpawn--;
      }
    }

    this.updateEnemies(dt);
    this.updateTowers(dt * 1000);
    this.updateProjectiles(dt);

    this.rendererBundle.composer.render();
    requestAnimationFrame(this.loop);
  };
}
