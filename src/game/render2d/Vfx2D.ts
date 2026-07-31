import type { Element } from "@/game/types";
import { elementPalette, type ElementPalette } from "./Palette";
import type { TopDownCamera2D } from "@/core/Camera2D";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface ActiveProjectile {
  x: number;
  y: number;
  element: Element;
  elementB: Element | null;
  speed: number;
  angle: number;
  spin: number;
  getTarget: () => [number, number, number];
  onArrive: (pos: [number, number, number]) => void;
}

const ELEMENT_NAMES: Element[] = ["fire", "ice", "lightning", "nature", "earth", "arcane"];

function elementsFromVfxId(vfxId: string): Element[] {
  const found: Element[] = [];
  for (const el of ELEMENT_NAMES) if (vfxId.includes(el)) found.push(el);
  return found;
}

/**
 * 2D stand-in for the old Three.js particle/shader VFX pipeline
 * (ParticleSystem/ProjectileVfx/ImpactVfx/AbilityVfx). Same external shape
 * Game.ts already calls (`projectiles.spawn`, `impacts.trigger`,
 * `emitVfx`) so the combat orchestrator didn't need restructuring — only
 * the implementation underneath changed, from GPU shader particles to
 * plain canvas shapes.
 *
 * Each element gets its own bullet *silhouette*, not just a recolored dot —
 * fire is a licking flame comet, ice a faceted shard, lightning a jagged
 * bolt with a spark trail, nature a curved leaf/thorn, earth a tumbling
 * rock chunk, arcane a rotating rune-sparkle — so a tower's shots read as
 * "that element" at a glance, matching the tower/enemy sprites' own
 * per-element shape language instead of a uniform colored ball.
 */
export class Vfx2D {
  private projectiles: ActiveProjectile[] = [];
  private particles: Particle[] = [];
  private rings: { x: number; y: number; life: number; maxLife: number; color: string; maxR: number }[] = [];

  readonly projectilesApi = {
    spawn: (
      element: Element,
      fromPos: [number, number, number],
      getTarget: () => [number, number, number],
      opts: { speed: number; onArrive: (pos: [number, number, number]) => void; elementB?: Element },
    ) => {
      const [tx, , tz] = getTarget();
      this.projectiles.push({
        x: fromPos[0],
        y: fromPos[2],
        element,
        elementB: opts.elementB ?? null,
        speed: opts.speed,
        angle: Math.atan2(tz - fromPos[2], tx - fromPos[0]),
        spin: Math.random() * Math.PI * 2,
        getTarget,
        onArrive: opts.onArrive,
      });
    },
  };

  readonly impactsApi = {
    trigger: (el: Element, pos: [number, number, number]) => this.burst(pos[0], pos[2], [el]),
    triggerFusion: (elA: Element, elB: Element, pos: [number, number, number]) =>
      this.burst(pos[0], pos[2], [elA, elB]),
  };

  emitVfx(vfxId: string, worldPos: [number, number, number]) {
    const els = elementsFromVfxId(vfxId);
    this.burst(worldPos[0], worldPos[2], els.length ? els : ["arcane"]);
    this.ring(worldPos[0], worldPos[2], els[0]);
  }

  private burst(wx: number, wy: number, elements: Element[]) {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const el = elements[i % elements.length];
      const pal = elementPalette(el);
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.2 + Math.random() * 1.8;
      this.particles.push({
        x: wx,
        y: wy,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        life: 0,
        maxLife: 0.32 + Math.random() * 0.18,
        color: Math.random() > 0.4 ? pal.accent : pal.light,
        size: 3 + Math.random() * 2,
      });
    }
  }

  private ring(wx: number, wy: number, el?: Element) {
    const pal = elementPalette(el ?? "arcane");
    this.rings.push({ x: wx, y: wy, life: 0, maxLife: 0.45, color: pal.accent, maxR: 1.1 });
  }

  private trail(wx: number, wy: number, element: Element) {
    const pal = elementPalette(element);
    this.particles.push({
      x: wx,
      y: wy,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      life: 0,
      maxLife: 0.16 + Math.random() * 0.1,
      color: pal.accent,
      size: 1.6 + Math.random(),
    });
  }

  update(dt: number) {
    for (const p of this.projectiles) {
      const [tx, , tz] = p.getTarget();
      const dx = tx - p.x;
      const dy = tz - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step || dist < 0.05) {
        p.onArrive([p.x, 0, p.y]);
        p.x = -1e9; // mark for removal below
        continue;
      }
      p.angle = Math.atan2(dy, dx);
      p.spin += dt * (p.element === "earth" ? 9 : p.element === "arcane" ? 3 : 0);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      if ((p.element === "fire" || p.element === "lightning") && Math.random() < 0.55) {
        this.trail(p.x, p.y, p.element);
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.x > -1e8);

    for (const particle of this.particles) {
      particle.life += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.9;
      particle.vy *= 0.9;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);

    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.maxLife);
  }

  draw(ctx: CanvasRenderingContext2D, cam: TopDownCamera2D, vw: number, vh: number) {
    for (const p of this.projectiles) {
      const [sx, sy] = cam.worldToScreen(p.x, p.y, vw, vh);
      const scale = cam.zoom / 30;
      const pal = elementPalette(p.element);
      const palB = p.elementB ? elementPalette(p.elementB) : null;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(scale, scale);
      drawBulletShape(ctx, p.element, pal, p.angle, p.spin);
      ctx.restore();

      if (palB) {
        ctx.fillStyle = palB.accent;
        ctx.beginPath();
        ctx.arc(sx - Math.cos(p.angle) * 5 * scale, sy - Math.sin(p.angle) * 5 * scale, 2.2 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const p of this.particles) {
      const [sx, sy] = cam.worldToScreen(p.x, p.y, vw, vh);
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = p.color;
      const size = p.size * (1 - t * 0.4) * (cam.zoom / 30);
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      ctx.globalAlpha = 1;
    }

    for (const r of this.rings) {
      const [sx, sy] = cam.worldToScreen(r.x, r.y, vw, vh);
      const t = r.life / r.maxLife;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, r.maxR * t * cam.zoom, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * Draws one element's bullet, already translated to the projectile's screen
 * position and scaled to world units — `angle` points along the travel
 * direction (0 = +x, i.e. rightward), `spin` is a free-running per-element
 * timer (used by earth's tumble and arcane's rotating ring, which shouldn't
 * be locked to travel direction).
 */
function drawBulletShape(ctx: CanvasRenderingContext2D, element: Element, pal: ElementPalette, angle: number, spin: number) {
  switch (element) {
    case "fire":
      return drawFlameBullet(ctx, pal, angle);
    case "ice":
      return drawShardBullet(ctx, pal, angle);
    case "lightning":
      return drawBoltBullet(ctx, pal, angle);
    case "nature":
      return drawLeafBullet(ctx, pal, angle);
    case "earth":
      return drawRockBullet(ctx, pal, spin);
    case "arcane":
      return drawRuneBullet(ctx, pal, spin);
  }
}

function drawFlameBullet(ctx: CanvasRenderingContext2D, pal: ElementPalette, angle: number) {
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.quadraticCurveTo(1, -3.2, -4.2, -1.6);
  ctx.quadraticCurveTo(-2, 0, -4.2, 1.6);
  ctx.quadraticCurveTo(1, 3.2, 5, 0);
  ctx.closePath();
  ctx.fillStyle = pal.dark;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4.4, 0);
  ctx.quadraticCurveTo(1, -1.8, -2.6, -0.8);
  ctx.quadraticCurveTo(-1, 0, -2.6, 0.8);
  ctx.quadraticCurveTo(1, 1.8, 4.4, 0);
  ctx.closePath();
  ctx.fillStyle = pal.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(2.4, 0, 1.3, 0, Math.PI * 2);
  ctx.fillStyle = "#fff6d8";
  ctx.fill();
}

function drawShardBullet(ctx: CanvasRenderingContext2D, pal: ElementPalette, angle: number) {
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(5.2, 0);
  ctx.lineTo(0.5, -2.2);
  ctx.lineTo(-4, 0);
  ctx.lineTo(0.5, 2.2);
  ctx.closePath();
  ctx.fillStyle = pal.dark;
  ctx.fill();
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(5.2, 0);
  ctx.lineTo(0.5, -2.2);
  ctx.lineTo(-1, 0);
  ctx.closePath();
  ctx.fillStyle = pal.light;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(3.6, -0.4);
  ctx.lineTo(1.4, -1);
  ctx.lineTo(2.2, 0.2);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawBoltBullet(ctx: CanvasRenderingContext2D, pal: ElementPalette, angle: number) {
  ctx.rotate(angle);
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(-6, 0.6);
  ctx.lineTo(5.5, 0);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(-4.5, 1.4);
  ctx.lineTo(-1.2, -1.6);
  ctx.lineTo(0.4, 0.4);
  ctx.lineTo(3.6, -1.8);
  ctx.lineTo(5.2, 0);
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = "#fff9c4";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(5, 0, 1, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}

function drawLeafBullet(ctx: CanvasRenderingContext2D, pal: ElementPalette, angle: number) {
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.quadraticCurveTo(0.5, -3, -4.6, 0);
  ctx.quadraticCurveTo(0.5, 3, 5, 0);
  ctx.closePath();
  ctx.fillStyle = pal.dark;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4.4, 0);
  ctx.quadraticCurveTo(0.5, -1.9, -3.8, 0);
  ctx.quadraticCurveTo(0.5, 1.9, 4.4, 0);
  ctx.closePath();
  ctx.fillStyle = pal.accent;
  ctx.fill();
  ctx.strokeStyle = pal.light;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(4, 0);
  ctx.lineTo(-3.2, 0);
  ctx.stroke();
}

function drawRockBullet(ctx: CanvasRenderingContext2D, pal: ElementPalette, spin: number) {
  ctx.rotate(spin);
  const pts: [number, number][] = [
    [3.4, -1.2],
    [1.4, -3.2],
    [-2, -2.4],
    [-3.4, 0.6],
    [-1, 3],
    [2.4, 2.2],
  ];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = pal.base;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[1][0], pts[1][1]);
  ctx.lineTo(pts[2][0], pts[2][1]);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = pal.light;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pts[3][0], pts[3][1]);
  ctx.lineTo(pts[4][0], pts[4][1]);
  ctx.lineTo(pts[5][0], pts[5][1]);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = pal.dark;
  ctx.fill();
}

function drawRuneBullet(ctx: CanvasRenderingContext2D, pal: ElementPalette, spin: number) {
  ctx.save();
  ctx.rotate(spin * 0.6);
  ctx.strokeStyle = pal.accent;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.6, 2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.rotate(spin);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const outer = 3.4;
    const inner = 1.1;
    const ox = Math.cos(a) * outer;
    const oy = Math.sin(a) * outer;
    const na = a + Math.PI / 4;
    const ix = Math.cos(na) * inner;
    const iy = Math.sin(na) * inner;
    if (i === 0) ctx.moveTo(ox, oy);
    else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fillStyle = pal.dark;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = pal.accent;
  ctx.beginPath();
  ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, 0.9, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}
