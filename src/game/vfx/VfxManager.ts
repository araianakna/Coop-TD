// Glue that ties ParticleSystem/ProjectileVfx/ImpactVfx together behind the
// exact function shape `TowerAbilityContext.emitVfx` expects (see
// game/types.ts): `(vfxId: string, worldPos: [number, number, number]) => void`.
//
// Typical wiring (by the Game/orchestrator layer):
//   const vfx = new VfxManager(scene);
//   const ctx: TowerAbilityContext = {
//     ...,
//     emitVfx: vfx.emitVfx,
//   };
//   // each frame:
//   vfx.update(dt);
//
// `emitVfx` understands any id produced by the helpers in "@/game/vfx/ids":
//   impactVfxId(element)       -> plays a one-shot impact burst
//   fusionVfxId(elementA, elementB) -> plays the fusion transform sequence
//   <any ability id, e.g. "vfx.fire.ability_ignite"> -> plays that ability's
//     bespoke AbilityVfx effect (see game/vfx/AbilityVfx.ts)
// `projectileVfxId(element)` ids are NOT one-shot (a projectile needs a
// moving target, which `emitVfx`'s single-worldPos signature can't express)
// — spawn those directly via `VfxManager.projectiles.spawn(...)` from
// wherever the tower-firing logic lives.
import * as THREE from "three";
import type { Element } from "@/game/types";
import { parseVfxId } from "@/game/vfx/ids";
import { ImpactVfx } from "@/game/vfx/ImpactVfx";
import { ProjectileVfx } from "@/game/vfx/ProjectileVfx";
import { AbilityVfx } from "@/game/vfx/AbilityVfx";

export class VfxManager {
  readonly impacts: ImpactVfx;
  readonly projectiles: ProjectileVfx;
  readonly abilities: AbilityVfx;

  constructor(scene: THREE.Scene) {
    this.impacts = new ImpactVfx(scene);
    this.projectiles = new ProjectileVfx(scene);
    this.abilities = new AbilityVfx(scene);
  }

  /** Bound function ready to hand straight to TowerAbilityContext.emitVfx. */
  emitVfx = (vfxId: string, worldPos: [number, number, number]): void => {
    const parsed = parseVfxId(vfxId);
    switch (parsed.kind) {
      case "impact":
        this.impacts.trigger(parsed.element as Element, worldPos);
        return;
      case "fusion":
        this.impacts.triggerFusion(parsed.elements[0], parsed.elements[1], worldPos);
        return;
      case "ability":
        this.abilities.trigger(parsed.id, worldPos);
        return;
      case "projectile":
        // Projectiles need a moving target; emitVfx only carries a static
        // point, so this is a no-op here — use `this.projectiles.spawn`
        // directly from tower-firing logic instead.
        console.warn(
          `[VfxManager] "${vfxId}" is a projectile vfx id; emitVfx can't spawn it ` +
            `(no target). Call vfxManager.projectiles.spawn(...) directly instead.`,
        );
        return;
      case "idle":
        // Idle vfx is expected to be a persistent per-tower effect owned by
        // the tower's own lifecycle, not a fire-and-forget emitVfx call.
        console.warn(`[VfxManager] "${vfxId}" is an idle vfx id; wire it up at tower-spawn time instead.`);
        return;
      default:
        console.warn(`[VfxManager] unrecognized vfxId "${vfxId}"`);
    }
  };

  update(dt: number): void {
    this.impacts.update(dt);
    this.projectiles.update(dt);
    this.abilities.update(dt);
  }

  dispose(): void {
    this.impacts.dispose();
    this.projectiles.dispose();
    this.abilities.dispose();
  }
}
