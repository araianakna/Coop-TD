import type { Element } from "@/game/types";
import { elementPalette } from "./Palette";
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
 * plain canvas circles/lines.
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
      this.projectiles.push({
        x: fromPos[0],
        y: fromPos[2],
        element,
        elementB: opts.elementB ?? null,
        speed: opts.speed,
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
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
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
      const pal = elementPalette(p.element);
      const palB = p.elementB ? elementPalette(p.elementB) : null;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fill();
      if (palB) {
        ctx.fillStyle = palB.accent;
        ctx.beginPath();
        ctx.arc(sx + 3, sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
      ctx.fill();
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
