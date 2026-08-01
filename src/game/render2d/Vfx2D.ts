import type { Element, StatusEffectKind } from "@/game/types";
import { elementPalette, type ElementPalette } from "./Palette";
import type { TopDownCamera2D } from "@/core/Camera2D";

type TowerCategory = "base" | "fusion" | "grand";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  /** Per-frame velocity multiplier — snappy bursts (sunder shrapnel, freeze
   * shards) want fast damping (~0.88); slow-drifting effects (rising
   * embers, poison bubbles) want it close to 1 so they keep coasting for
   * their whole lifetime instead of stopping dead a few frames in. */
  damping: number;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  maxR: number;
  /** false = shrinks from maxR to 0 instead of expanding — silence's
   * "suppression" read (the opposite of an outward blast). */
  growing: boolean;
  width: number;
  dashed: boolean;
}

interface Arc {
  x: number;
  y: number;
  points: [number, number][];
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

interface ActiveProjectile {
  x: number;
  y: number;
  element: Element;
  elementB: Element | null;
  tier: 1 | 2 | 3;
  category: TowerCategory;
  /** The firing tower's primary ability status, when it has one — drawn as
   * a small accent motif riding alongside the base elemental bullet shape
   * (see drawStatusAccent) so a tower's shots hint at what they actually DO
   * (chill vs. shock vs. curse, ...), not just which element they carry.
   * With 100+ towers now sharing just 7 element shapes, this is what keeps
   * a Voidglass Wraith's bolt reading as meaningfully different from a
   * Twinflame Geyser's at a glance, without hand-authoring bespoke bullet
   * art per tower. */
  statusAccent: StatusEffectKind | null;
  speed: number;
  angle: number;
  spin: number;
  auraSpin: number;
  getTarget: () => [number, number, number];
  onArrive: (pos: [number, number, number]) => void;
}

const ELEMENT_NAMES: Element[] = ["fire", "ice", "lightning", "nature", "earth", "arcane", "shadow"];

function elementsFromVfxId(vfxId: string): Element[] {
  const found: Element[] = [];
  for (const el of ELEMENT_NAMES) if (vfxId.includes(el)) found.push(el);
  return found;
}

// base -> fusion -> grand, and within each, tier 1 -> 2 -> 3: every bullet
// gets progressively bigger, trails harder, and picks up extra flourish
// (a soft aura glow at fusion, a rotating dashed "power ring" at grand) so
// a Grand Fusion tower's shots unmistakably read as more powerful than a
// base tower's, independent of which element(s) they carry.
const CATEGORY_SIZE: Record<TowerCategory, number> = { base: 1, fusion: 1.28, grand: 1.6 };
const TIER_SIZE: Record<1 | 2 | 3, number> = { 1: 1, 2: 1.1, 3: 1.22 };

function trailChance(element: Element, category: TowerCategory): number {
  const elementBase = element === "fire" || element === "lightning" ? 0.3 : 0;
  const categoryBonus = category === "fusion" ? 0.3 : category === "grand" ? 0.55 : 0;
  return Math.min(0.92, elementBase + categoryBonus);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
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
 * per-element shape language instead of a uniform colored ball. On top of
 * that, size/trail-density/aura scale with the firing tower's category
 * (base/fusion/grand) and tier, so more powerful towers visibly throw
 * more powerful-looking shots.
 */
export class Vfx2D {
  private projectiles: ActiveProjectile[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private arcs: Arc[] = [];

  readonly projectilesApi = {
    spawn: (
      element: Element,
      fromPos: [number, number, number],
      getTarget: () => [number, number, number],
      opts: {
        speed: number;
        onArrive: (pos: [number, number, number]) => void;
        elementB?: Element;
        tier?: 1 | 2 | 3;
        category?: TowerCategory;
        statusAccent?: StatusEffectKind | null;
      },
    ) => {
      const [tx, , tz] = getTarget();
      this.projectiles.push({
        x: fromPos[0],
        y: fromPos[2],
        element,
        elementB: opts.elementB ?? null,
        tier: opts.tier ?? 1,
        category: opts.category ?? "base",
        statusAccent: opts.statusAccent ?? null,
        speed: opts.speed,
        angle: Math.atan2(tz - fromPos[2], tx - fromPos[0]),
        spin: Math.random() * Math.PI * 2,
        auraSpin: Math.random() * Math.PI * 2,
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

  /**
   * `statusKind`, when supplied, routes to a bespoke per-effect visual —
   * burn throws rising embers, freeze shatters into a held ice ring,
   * silence collapses inward, and so on — so an ability's VFX actually
   * shows what it does instead of every ability getting the same colored
   * puff. Falls back to the generic multi-element burst for abilities that
   * only deal bonus damage (no status), e.g. Stonewarden's Cataclysm.
   */
  emitVfx(vfxId: string, worldPos: [number, number, number], statusKind?: StatusEffectKind) {
    const els = elementsFromVfxId(vfxId);
    const wx = worldPos[0];
    const wy = worldPos[2];
    if (statusKind) {
      this.statusVfx(wx, wy, statusKind, els.length ? els : ["arcane"]);
      return;
    }
    this.burst(wx, wy, els.length ? els : ["arcane"]);
    this.ring(wx, wy, els[0]);
  }

  private statusVfx(wx: number, wy: number, kind: StatusEffectKind, elements: Element[]) {
    const pal = elementPalette(elements[0]);
    switch (kind) {
      case "burn":
        return this.burnVfx(wx, wy, pal);
      case "chill":
        return this.chillVfx(wx, wy, pal);
      case "freeze":
        return this.freezeVfx(wx, wy, pal);
      case "shock":
        return this.shockVfx(wx, wy, pal);
      case "poison":
        return this.poisonVfx(wx, wy, pal);
      case "root":
        return this.rootVfx(wx, wy, pal);
      case "sunder":
        return this.sunderVfx(wx, wy, pal);
      case "silence":
        return this.silenceVfx(wx, wy, pal);
      case "curse":
        return this.curseVfx(wx, wy, pal);
    }
  }

  /** Rising embers — mostly-upward cone, slow damping so they keep coasting
   * up instead of stopping dead, plus a quick warm flash ring. */
  private burnVfx(wx: number, wy: number, pal: ElementPalette) {
    for (let i = 0; i < 12; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.3;
      const speed = 0.7 + Math.random() * 1.3;
      this.pushParticle(wx, wy, Math.cos(ang) * speed * 0.5, Math.sin(ang) * speed, 0.5 + Math.random() * 0.35, Math.random() > 0.4 ? pal.accent : pal.light, 2.6 + Math.random() * 2, 0.97);
    }
    this.ring(wx, wy, undefined, pal.accent, 0.3, 0.75, false, 2.4, false);
  }

  /** Slow, quiet frost motes drifting outward — chill is a creeping effect,
   * not an explosion, so no ring flash, just a gentle pale-blue haze. */
  private chillVfx(wx: number, wy: number, pal: ElementPalette) {
    for (let i = 0; i < 9; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = 0.25 + Math.random() * 0.4;
      this.pushParticle(wx, wy, Math.cos(ang) * speed, Math.sin(ang) * speed - 0.15, 0.55 + Math.random() * 0.3, Math.random() > 0.5 ? pal.light : "#eafcff", 2 + Math.random() * 1.6, 0.985);
    }
  }

  /** Sharp icy shatter — fast angular shard burst plus a solid, long-held
   * ring (freeze locks the target in place, so the ring should linger). */
  private freezeVfx(wx: number, wy: number, pal: ElementPalette) {
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 1.6 + Math.random() * 1.6;
      this.pushParticle(wx, wy, Math.cos(ang) * speed, Math.sin(ang) * speed, 0.32 + Math.random() * 0.2, Math.random() > 0.5 ? "#ffffff" : pal.accent, 2.4 + Math.random() * 1.8, 0.88);
    }
    this.ring(wx, wy, undefined, "#eafcff", 0.65, 0.85, false, 2.8, false);
    this.ring(wx, wy, undefined, pal.accent, 0.65, 1.0, false, 1.4, false);
  }

  /** Instant jagged arcs radiating out, redrawn every trigger like a real
   * zap — arcs fade almost immediately, so the "effect" is the snap itself
   * rather than a lingering cloud. */
  private shockVfx(wx: number, wy: number, pal: ElementPalette) {
    const boltCount = 5;
    for (let i = 0; i < boltCount; i++) {
      const baseAng = (i / boltCount) * Math.PI * 2 + Math.random() * 0.5;
      const len = 1.3 + Math.random() * 0.9;
      const points: [number, number][] = [[0, 0]];
      let px = 0;
      let py = 0;
      const segs = 3;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const jitter = (Math.random() - 0.5) * 0.5;
        px = Math.cos(baseAng) * len * t + Math.cos(baseAng + Math.PI / 2) * jitter;
        py = Math.sin(baseAng) * len * t + Math.sin(baseAng + Math.PI / 2) * jitter;
        points.push([px, py]);
      }
      this.arcs.push({ x: wx, y: wy, points, life: 0, maxLife: 0.14 + Math.random() * 0.06, color: Math.random() > 0.4 ? "#fff9c4" : pal.accent, width: 0.12 });
    }
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.pushParticle(wx, wy, Math.cos(ang) * 1.5, Math.sin(ang) * 1.5, 0.15, "#ffffff", 2, 0.8);
    }
  }

  /** Erratic slow-rising bubbles with a lingering sickly pulse — poison is
   * meant to feel like it's still working on the target after the visual
   * settles, so both the particles and the ring outlast most other kinds. */
  private poisonVfx(wx: number, wy: number, pal: ElementPalette) {
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const speed = 0.4 + Math.random() * 0.6;
      this.pushParticle(wx, wy, Math.cos(ang) * speed, Math.sin(ang) * speed, 0.6 + Math.random() * 0.4, Math.random() > 0.5 ? pal.accent : pal.light, 2.2 + Math.random() * 1.8, 0.98);
    }
    this.ring(wx, wy, undefined, pal.accent, 0.55, 0.7, false, 1.6, false);
  }

  /** Curling vine tendrils sprouting from the ground point, plus a couple
   * of leaf motes at the tips — the only status effect drawn as growing
   * curves instead of radiating particles, matching "you're rooted in
   * place" rather than "something hit you". */
  private rootVfx(wx: number, wy: number, pal: ElementPalette) {
    const vineCount = 3;
    for (let i = 0; i < vineCount; i++) {
      const baseAng = -Math.PI / 2 + (i - (vineCount - 1) / 2) * 0.9 + (Math.random() - 0.5) * 0.3;
      const len = 1.1 + Math.random() * 0.5;
      const curl = (Math.random() - 0.5) * 1.4;
      const points: [number, number][] = [[0, 0]];
      const segs = 5;
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const bend = Math.sin(t * Math.PI * 0.5) * curl;
        const px = Math.cos(baseAng) * len * t + Math.cos(baseAng + Math.PI / 2) * bend * t;
        const py = Math.sin(baseAng) * len * t + Math.sin(baseAng + Math.PI / 2) * bend * t;
        points.push([px, py]);
      }
      this.arcs.push({ x: wx, y: wy, points, life: 0, maxLife: 0.5 + Math.random() * 0.15, color: pal.dark, width: 0.28 });
      const [tx, ty] = points[points.length - 1];
      this.pushParticle(wx + tx, wy + ty, 0, -0.1, 0.4, pal.accent, 2.2, 0.95);
    }
  }

  /** Angular grey-brown shrapnel bursting fast outward, like armor
   * physically cracking apart, plus a brief flat shockwave. Always stone-
   * toned regardless of the tower's element — sunder is about armor
   * breaking, not about which element caused it. */
  private sunderVfx(wx: number, wy: number, _pal: ElementPalette) {
    const shrapnelColors = ["#c9b28f", "#8a7460", "#544539"];
    for (let i = 0; i < 11; i++) {
      const ang = (i / 11) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.4 + Math.random() * 1.5;
      this.pushParticle(wx, wy, Math.cos(ang) * speed, Math.sin(ang) * speed, 0.3 + Math.random() * 0.2, shrapnelColors[i % shrapnelColors.length], 2 + Math.random() * 2, 0.86);
    }
    this.ring(wx, wy, undefined, "#c9b28f", 0.28, 0.9, false, 2.2, false);
  }

  /** A ring that shrinks inward instead of expanding, with a few particles
   * pulled toward the center — the visual opposite of every other effect's
   * outward burst, reading as "suppression" rather than "impact". */
  private silenceVfx(wx: number, wy: number, pal: ElementPalette) {
    this.ring(wx, wy, undefined, pal.accent, 0.4, 1.1, true, 1.6, true);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const r = 1.1 + Math.random() * 0.3;
      this.pushParticle(wx + Math.cos(ang) * r, wy + Math.sin(ang) * r, -Math.cos(ang) * 1.2, -Math.sin(ang) * 1.2, 0.32, pal.light, 2, 0.86);
    }
  }

  /** A dashed sigil ring flashing onto the target plus a handful of dark
   * motes drifting slowly DOWNWARD — every other status either rises,
   * radiates, or pulls inward, so curse's "something heavy just landed on
   * you" read (a brand making future hits worse, not an instant effect)
   * comes from being the only one that sinks. */
  private curseVfx(wx: number, wy: number, pal: ElementPalette) {
    this.ring(wx, wy, undefined, pal.accent, 0.5, 0.95, true, 1.3, true);
    for (let i = 0; i < 7; i++) {
      const ang = -Math.PI / 2 + (i / 7) * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.3;
      this.pushParticle(
        wx + Math.cos(ang) * r,
        wy + Math.sin(ang) * r - 0.6,
        Math.cos(ang) * 0.1,
        0.55 + Math.random() * 0.3,
        0.6 + Math.random() * 0.25,
        Math.random() > 0.5 ? pal.dark : pal.base,
        2 + Math.random() * 1.4,
        0.96,
      );
    }
  }

  private pushParticle(x: number, y: number, vx: number, vy: number, maxLife: number, color: string, size: number, damping: number) {
    this.particles.push({ x, y, vx, vy, life: 0, maxLife, color, size, damping });
  }

  private burst(wx: number, wy: number, elements: Element[]) {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const el = elements[i % elements.length];
      const pal = elementPalette(el);
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.2 + Math.random() * 1.8;
      this.pushParticle(wx, wy, Math.cos(ang) * speed, Math.sin(ang) * speed, 0.32 + Math.random() * 0.18, Math.random() > 0.4 ? pal.accent : pal.light, 3 + Math.random() * 2, 0.9);
    }
  }

  private ring(
    wx: number,
    wy: number,
    el?: Element,
    colorOverride?: string,
    maxLife = 0.45,
    maxR = 1.1,
    growing = true,
    width = 2,
    dashed = false,
  ) {
    const color = colorOverride ?? elementPalette(el ?? "arcane").accent;
    this.rings.push({ x: wx, y: wy, life: 0, maxLife, color, maxR, growing, width, dashed });
  }

  private trail(wx: number, wy: number, element: Element, sizeMult: number) {
    const pal = elementPalette(element);
    this.pushParticle(
      wx,
      wy,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.3,
      0.16 + Math.random() * 0.1,
      pal.accent,
      (1.6 + Math.random()) * sizeMult,
      0.9,
    );
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
      p.auraSpin += dt * 2.6;
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      if (Math.random() < trailChance(p.element, p.category)) {
        this.trail(p.x, p.y, p.element, CATEGORY_SIZE[p.category] * TIER_SIZE[p.tier]);
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.x > -1e8);

    for (const particle of this.particles) {
      particle.life += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= particle.damping;
      particle.vy *= particle.damping;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);

    for (const r of this.rings) r.life += dt;
    this.rings = this.rings.filter((r) => r.life < r.maxLife);

    for (const a of this.arcs) a.life += dt;
    this.arcs = this.arcs.filter((a) => a.life < a.maxLife);
  }

  draw(ctx: CanvasRenderingContext2D, cam: TopDownCamera2D, vw: number, vh: number) {
    for (const p of this.projectiles) {
      const [sx, sy] = cam.worldToScreen(p.x, p.y, vw, vh);
      const zoomScale = cam.zoom / 30;
      const sizeMult = CATEGORY_SIZE[p.category] * TIER_SIZE[p.tier];
      const scale = zoomScale * sizeMult;
      const pal = elementPalette(p.element);
      const palB = p.elementB ? elementPalette(p.elementB) : null;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(scale, scale);
      drawAura(ctx, p.category, pal, palB, p.auraSpin);
      drawBulletShape(ctx, p.element, pal, p.angle, p.spin);
      if (p.statusAccent) drawStatusAccent(ctx, p.statusAccent, p.auraSpin);
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
      const radiusT = r.growing ? t : 1 - t;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.setLineDash(r.dashed ? [3, 2] : []);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, r.maxR * radiusT * cam.zoom), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    for (const a of this.arcs) {
      const [sx, sy] = cam.worldToScreen(a.x, a.y, vw, vh);
      const t = a.life / a.maxLife;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.width * cam.zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const [x0, y0] = a.points[0];
      ctx.moveTo(sx + x0 * cam.zoom, sy + y0 * cam.zoom);
      for (let i = 1; i < a.points.length; i++) {
        const [px, py] = a.points[i];
        ctx.lineTo(sx + px * cam.zoom, sy + py * cam.zoom);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

/** Soft glow + (for Grand Fusion only) a rotating dashed power-ring drawn
 * behind the elemental shape — the "this bullet came from something more
 * powerful than a base tower" cue, independent of which element fired. */
function drawAura(ctx: CanvasRenderingContext2D, category: TowerCategory, pal: ElementPalette, palB: ElementPalette | null, auraSpin: number) {
  if (category === "base") return;

  const strength = category === "grand" ? 1 : 0.55;
  const radius = category === "grand" ? 7.5 : 6.2;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  grad.addColorStop(0, rgba(pal.accent, 0.4 * strength));
  grad.addColorStop(1, rgba(pal.accent, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  if (category === "grand") {
    ctx.save();
    ctx.rotate(auraSpin);
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = palB ? palB.accent : pal.light;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([1.4, 1.6]);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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
    case "shadow":
      return drawWispBullet(ctx, pal, angle);
  }
}

/** Status colors matched to Game.ts's STATUS_COLOR (the enemy status-icon
 * palette) so the same kind reads as the same color everywhere in the game
 * — a bullet's accent, the icon over an afflicted enemy's head, and the
 * impact VFX it triggers all agree. */
const STATUS_ACCENT_COLOR: Record<StatusEffectKind, string> = {
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

/**
 * A small motif riding alongside the base elemental bullet shape, keyed by
 * the firing tower's primary ability status — not its element — so the
 * player gets a glance-legible read of what a shot actually DOES. Drawn in
 * the same already-translated/scaled space as the bullet itself (see
 * draw()), independent of travel angle: `spin` is a free-running per-
 * projectile timer, used for the ones that gently orbit/pulse.
 */
function drawStatusAccent(ctx: CanvasRenderingContext2D, kind: StatusEffectKind, spin: number) {
  const color = STATUS_ACCENT_COLOR[kind];
  ctx.save();
  switch (kind) {
    case "burn": {
      // A small ember riding just behind the bullet, bobbing.
      const bob = Math.sin(spin * 4) * 0.6;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-4.5, -1.5 + bob, 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "chill": {
      // A tiny faceted ice tick above the bullet.
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-1, -3.4);
      ctx.lineTo(0, -5);
      ctx.lineTo(1, -3.4);
      ctx.stroke();
      break;
    }
    case "freeze": {
      // A thin static halo ring around the whole bullet.
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, 4.4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "shock": {
      // A tiny zigzag spark riding above the bullet.
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-1.4, -3);
      ctx.lineTo(-0.2, -4.2);
      ctx.lineTo(-0.8, -4.2);
      ctx.lineTo(0.6, -5.6);
      ctx.stroke();
      break;
    }
    case "root": {
      // A tiny curled vine hook trailing the bullet.
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-3, 0);
      ctx.quadraticCurveTo(-5, -0.5, -5.4, 1.2);
      ctx.stroke();
      break;
    }
    case "poison": {
      // Two tiny bubbles drifting behind, independently timed.
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(-4, -0.5 + Math.sin(spin * 3) * 0.5, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-5.5, 1 + Math.sin(spin * 3 + 1.5) * 0.5, 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "sunder": {
      // A small jagged crack accent, stone-toned regardless of element.
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -3.6);
      ctx.lineTo(0.8, -2.2);
      ctx.lineTo(0.1, -1.6);
      ctx.stroke();
      break;
    }
    case "silence": {
      // A small fading dashed ring — a muted echo, distinct from freeze's
      // solid static halo.
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 0.45;
      ctx.setLineDash([1, 1.2]);
      ctx.beginPath();
      ctx.arc(0, 0, 3.6, spin, spin + Math.PI * 1.4);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "curse": {
      // A small dark eye-glint trailing the bullet.
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(-4.2, -0.5, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f2e8ff";
      ctx.beginPath();
      ctx.arc(-4.4, -0.7, 0.35, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
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

/** Wisp orb — a dark core trailing a translucent smoky tail (travel-facing,
 * like fire/ice/nature), with a single bright eye-glint at the leading edge
 * so it reads as "watching" rather than a plain glowing ball. */
function drawWispBullet(ctx: CanvasRenderingContext2D, pal: ElementPalette, angle: number) {
  ctx.rotate(angle);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(2.2, 0);
  ctx.quadraticCurveTo(-2, -2.7, -5.6, -0.7);
  ctx.quadraticCurveTo(-3, 0, -5.6, 0.7);
  ctx.quadraticCurveTo(-2, 2.7, 2.2, 0);
  ctx.closePath();
  ctx.fillStyle = pal.dark;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(1.4, 0, 2.1, 0, Math.PI * 2);
  ctx.fillStyle = pal.base;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1.6, 0, 1.15, 0, Math.PI * 2);
  ctx.fillStyle = pal.accent;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(2, 0, 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
}
