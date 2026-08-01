// Event-driven combat sounds. This is the layer that will get wired
// one-to-one onto Game.ts's combat events once the orchestrator hooks things
// up (see the file header of index.ts for the exact mapping) — every public
// method here corresponds to one event in that list: resolveHit -> impact,
// killEnemy -> enemyDeath, an enemy reaching the base inside updateEnemies ->
// enemyLeaked, handleFusionConfirm -> fusionComplete, handleUpgrade ->
// towerUpgraded, handleSell -> towerSold, tryPlaceTower -> towerPlaced,
// applyStatus (via TowerAbilityContext) -> statusApplied.
//
// Status-effect sounds are grouped by StatusEffectKind (8 kinds: burn/chill/
// freeze/shock/root/poison/sunder/silence — see game/types.ts), each layered
// with the triggering element's color via ElementSfx, per the brief's
// "group by statusKind, layer elemental color" scope-reduction for the 21
// abilities (no bespoke sound per ability — a tractable ~8+6 build instead
// of 21 one-offs, matching statusKind's actual mechanical grouping).
import type { Element, StatusEffectKind } from "@/game/types";
import { AudioEngine, combineHandles, type PlayHandle } from "@/audio/AudioEngine";
import { ElementSfx, type ElementSoundOptions } from "@/audio/ElementSfx";

export class CombatSfx {
  readonly element: ElementSfx;

  constructor(private engine: AudioEngine) {
    this.element = new ElementSfx(engine);
  }

  /** Projectile leaving a tower. */
  projectileFire(el: Element, opts?: ElementSoundOptions): PlayHandle {
    return this.element.launch(el, opts);
  }

  /** Projectile/ability hit landing on an enemy. `worldPos` is accepted for
   * API symmetry with the VFX layer (ImpactVfx.trigger(element, worldPos))
   * but intentionally unused — this pass keeps audio non-positional/2D per
   * the brief; a future pass could map it to a StereoPannerNode via screen-
   * space X. */
  impact(el: Element, worldPos?: [number, number, number], opts?: ElementSoundOptions): PlayHandle {
    void worldPos;
    return this.element.impact(el, opts);
  }

  /** Alias of impact(), kept as its own named method because the brief and
   * Game.ts's event vocabulary refer to it separately ("enemy hit"); reuses
   * the identical elemental impact sound rather than diverging from it. */
  enemyHit(el: Element, opts?: ElementSoundOptions): PlayHandle {
    return this.element.impact(el, opts);
  }

  /** A tower ability firing — generic elemental flourish, layered on top of
   * whatever statusApplied() sound the ability's status effect triggers. */
  abilityCast(el: Element, opts?: ElementSoundOptions): PlayHandle {
    return this.element.abilityCast(el, opts);
  }

  /** Satisfying enemy-death "pop"/collapse. Scaled up substantially for boss
   * deaths — bigger, longer, more layered, not just louder. */
  enemyDeath(isBoss = false): PlayHandle {
    if (!isBoss) {
      return combineHandles([
        this.engine.playNoiseBurst({
          duration: 0.14,
          color: "white",
          filterType: "bandpass",
          filterFreq: 1200,
          filterFreqEnd: 300,
          filterQ: 1.2,
          gain: 0.28,
        }),
        this.engine.playTone({
          freq: 420,
          endFreq: 120,
          type: "sine",
          sweepExponential: true,
          attack: 0.003,
          decay: 0.08,
          release: 0.14,
          gain: 0.22,
        }),
      ]);
    }
    // Boss death: a five-layer collapse — sub-bass thud, a longer descending
    // groan, a crumbling debris-noise tail, and a delayed second "echo" hit
    // — noticeably bigger and longer than the ~0.2s base-enemy pop above.
    return combineHandles([
      this.engine.playTone({
        freq: 90,
        endFreq: 30,
        type: "sine",
        sweepExponential: true,
        attack: 0.01,
        decay: 0.2,
        release: 0.6,
        gain: 0.55,
      }),
      this.engine.playTone({
        freq: 300,
        endFreq: 60,
        type: "sawtooth",
        sweepExponential: true,
        attack: 0.02,
        decay: 0.3,
        release: 0.5,
        gain: 0.22,
        filterType: "lowpass",
        filterFreq: 900,
      }),
      this.engine.playNoiseBurst({
        duration: 0.9,
        color: "pink",
        filterType: "lowpass",
        filterFreq: 500,
        filterFreqEnd: 120,
        gain: 0.35,
        reverbSend: 0.25,
      }),
      this.engine.playNoiseBurst({
        duration: 0.25,
        startDelay: 0.28,
        color: "white",
        filterType: "bandpass",
        filterFreq: 900,
        gain: 0.18,
      }),
      this.engine.playTone({
        freq: 150,
        endFreq: 40,
        type: "triangle",
        startDelay: 0.35,
        attack: 0.01,
        decay: 0.2,
        release: 0.5,
        gain: 0.2,
        reverbSend: 0.2,
      }),
    ]);
  }

  /** An enemy leaking past the base and reaching it — a distinct "failure"
   * cue, deliberately NOT just a quieter/duller death sound: a dissonant
   * descending tritone pair plus a harsh alarm-like buzz. */
  enemyLeaked(): PlayHandle {
    return combineHandles([
      this.engine.playTone({
        freq: 311.13, // Eb4
        endFreq: 233.08, // Bb3
        type: "square",
        attack: 0.005,
        decay: 0.12,
        release: 0.18,
        gain: 0.22,
        filterType: "lowpass",
        filterFreq: 1400,
      }),
      this.engine.playTone({
        freq: 220, // A3 — a tritone below Eb4, the classic "wrong" interval
        endFreq: 164.81, // E3
        type: "square",
        startDelay: 0.09,
        attack: 0.005,
        decay: 0.12,
        release: 0.22,
        gain: 0.2,
        filterType: "lowpass",
        filterFreq: 1400,
      }),
      this.engine.playNoiseBurst({
        duration: 0.3,
        color: "white",
        filterType: "bandpass",
        filterFreq: 1800,
        filterQ: 4,
        gain: 0.14,
      }),
    ]);
  }

  /** Multi-stage tower-fusion transformation "wow" moment, mirroring
   * ImpactVfx.triggerFusion's build-up -> flash/shockwave -> settle shape in
   * three audio beats: charge (rising sweep), climax (big layered stab +
   * crack), settle (soft shimmering decay). */
  fusionComplete(): PlayHandle {
    const handles: PlayHandle[] = [];
    // Stage 1 (0.00s): charge — rising filtered-noise sweep + rising pitch.
    handles.push(
      this.engine.playNoiseBurst({
        duration: 0.32,
        color: "white",
        filterType: "bandpass",
        filterFreq: 300,
        filterFreqEnd: 2200,
        filterQ: 1.5,
        gain: 0.18,
      }),
      this.engine.playTone({
        freq: 180,
        endFreq: 720,
        type: "sawtooth",
        sweepExponential: true,
        attack: 0.28,
        decay: 0.03,
        release: 0.02,
        gain: 0.14,
        filterType: "lowpass",
        filterFreq: 2600,
      }),
    );
    // Stage 2 (0.30s): climax — a bright layered stab (three-note chord) +
    // a sharp noise crack, the "pop" moment.
    const climaxDelay = 0.3;
    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6 — bright major triad + octave
    for (let i = 0; i < chord.length; i++) {
      handles.push(
        this.engine.playTone({
          freq: chord[i],
          type: i % 2 === 0 ? "triangle" : "sine",
          startDelay: climaxDelay,
          attack: 0.005,
          decay: 0.16,
          release: 0.5,
          gain: 0.16,
          reverbSend: 0.3,
        }),
      );
    }
    handles.push(
      this.engine.playNoiseBurst({
        duration: 0.2,
        startDelay: climaxDelay,
        color: "white",
        filterType: "highpass",
        filterFreq: 2000,
        gain: 0.3,
      }),
    );
    // Stage 3 (0.65s): settle — soft shimmering detuned pad decaying slowly.
    const settleDelay = 0.65;
    handles.push(
      this.engine.playTone({
        freq: 1046.5,
        type: "sine",
        detune: -10,
        startDelay: settleDelay,
        attack: 0.1,
        decay: 0.3,
        release: 0.9,
        gain: 0.1,
        reverbSend: 0.35,
      }),
      this.engine.playTone({
        freq: 1046.5,
        type: "sine",
        detune: 10,
        startDelay: settleDelay,
        attack: 0.12,
        decay: 0.3,
        release: 1.0,
        gain: 0.1,
        reverbSend: 0.35,
      }),
    );
    return combineHandles(handles);
  }

  /** Solid, satisfying "thunk" of a tower being placed. */
  towerPlaced(): PlayHandle {
    return combineHandles([
      this.engine.playTone({
        freq: 150,
        endFreq: 90,
        type: "sine",
        attack: 0.002,
        decay: 0.06,
        release: 0.1,
        gain: 0.3,
      }),
      this.engine.playNoiseBurst({
        duration: 0.08,
        color: "pink",
        filterType: "lowpass",
        filterFreq: 900,
        gain: 0.2,
      }),
    ]);
  }

  /** Ascending "power up" chime for a tower upgrade — three rising notes. */
  towerUpgraded(): PlayHandle {
    const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
    return combineHandles(
      notes.map((freq, i) =>
        this.engine.playTone({
          freq,
          type: "triangle",
          startDelay: i * 0.07,
          attack: 0.005,
          decay: 0.1,
          release: 0.22,
          gain: 0.2,
        }),
      ),
    );
  }

  /** Descending/deflating tone for selling a tower. */
  towerSold(): PlayHandle {
    return combineHandles([
      this.engine.playTone({
        freq: 500,
        endFreq: 160,
        type: "sawtooth",
        sweepExponential: true,
        attack: 0.005,
        decay: 0.14,
        release: 0.22,
        gain: 0.18,
        filterType: "lowpass",
        filterFreq: 1800,
        filterFreqEnd: 400,
      }),
    ]);
  }

  /** Status-effect application sound, grouped by StatusEffectKind and
   * layered with the triggering element's color (via ElementSfx.impact as
   * the elemental base layer under each kind's bespoke identity). */
  statusApplied(kind: StatusEffectKind, el: Element = statusKindDefaultElement(kind)): PlayHandle {
    const base = this.element.impact(el, { intensity: 0.5 });
    const extra = this.statusLayer(kind);
    return combineHandles([base, extra]);
  }

  private statusLayer(kind: StatusEffectKind): PlayHandle {
    switch (kind) {
      case "burn":
        // Sizzling crackle burst + a short rising-then-catching tone.
        return combineHandles([
          this.engine.playNoiseBurst({ duration: 0.28, color: "pink", filterType: "bandpass", filterFreq: 2000, filterQ: 1.5, gain: 0.16 }),
          this.engine.playTone({ freq: 200, endFreq: 340, type: "sawtooth", attack: 0.02, decay: 0.08, release: 0.14, gain: 0.1 }),
        ]);
      case "chill":
        // Quick descending high tinkle + soft breathy noise.
        return combineHandles([
          this.engine.playTone({ freq: 1600, endFreq: 1300, type: "sine", attack: 0.004, decay: 0.08, release: 0.16, gain: 0.14 }),
          this.engine.playNoiseBurst({ duration: 0.2, color: "white", filterType: "highpass", filterFreq: 5000, gain: 0.06 }),
        ]);
      case "freeze":
        // A harder version of chill that locks: glides down then HOLDS a
        // static metallic pitch (a real sustain) rather than decaying away
        // — the "frozen in place" identity distinct from chill's brief tinkle.
        return combineHandles([
          this.engine.playTone({
            freq: 1400,
            endFreq: 700,
            type: "sine",
            sweepExponential: true,
            attack: 0.01,
            decay: 0.1,
            sustain: 0.6,
            sustainTime: 0.35,
            release: 0.3,
            gain: 0.18,
          }),
          this.engine.playTone({ freq: 2100, type: "sine", attack: 0.02, decay: 0.15, sustain: 0.4, sustainTime: 0.3, release: 0.3, gain: 0.08 }),
        ]);
      case "shock":
        // Buzzy zap: square wave with a fast pitch wobble (two closely-tuned
        // detuned voices beating) + a click.
        return combineHandles([
          this.engine.playTone({ freq: 700, endFreq: 120, type: "square", detune: -30, attack: 0.001, decay: 0.05, release: 0.06, gain: 0.12 }),
          this.engine.playTone({ freq: 700, endFreq: 120, type: "square", detune: 30, attack: 0.001, decay: 0.05, release: 0.06, gain: 0.12 }),
          this.engine.playNoiseBurst({ duration: 0.04, color: "white", filterType: "highpass", filterFreq: 4000, gain: 0.14 }),
        ]);
      case "root":
        // Low wood-creak/snap: a low bandpass noise "crack" plus a quick
        // downward pitch-bend, like a vine yanking taut.
        return combineHandles([
          this.engine.playNoiseBurst({ duration: 0.16, color: "pink", filterType: "bandpass", filterFreq: 260, filterQ: 4, gain: 0.18 }),
          this.engine.playTone({ freq: 220, endFreq: 90, type: "triangle", attack: 0.005, decay: 0.1, release: 0.14, gain: 0.12 }),
        ]);
      case "poison":
        // Sickly dissonant descending tone (two oscillators a minor 2nd
        // apart) + a slow bubbling noise.
        return combineHandles([
          this.engine.playTone({ freq: 300, endFreq: 200, type: "sine", attack: 0.02, decay: 0.16, release: 0.3, gain: 0.12 }),
          this.engine.playTone({ freq: 318, endFreq: 212, type: "sine", attack: 0.02, decay: 0.16, release: 0.3, gain: 0.1 }),
          this.engine.playNoiseBurst({ duration: 0.4, color: "pink", filterType: "bandpass", filterFreq: 500, filterFreqEnd: 350, filterQ: 2, gain: 0.1 }),
        ]);
      case "sunder":
        // Sharp crack/shatter noise + a low crumbling rumble underneath.
        return combineHandles([
          this.engine.playNoiseBurst({ duration: 0.12, color: "white", filterType: "bandpass", filterFreq: 2200, filterQ: 2, gain: 0.2 }),
          this.engine.playNoiseBurst({ duration: 0.3, color: "pink", filterType: "lowpass", filterFreq: 300, gain: 0.16 }),
        ]);
      case "silence":
        // A tone that starts, then gets abruptly muffled (filter slammed
        // closed) — audibly "cut off" rather than naturally decaying,
        // representing suppression.
        return combineHandles([
          this.engine.playTone({
            freq: 500,
            type: "triangle",
            attack: 0.01,
            decay: 0.05,
            sustain: 0.7,
            sustainTime: 0.05,
            release: 0.06,
            gain: 0.16,
            filterType: "lowpass",
            filterFreq: 4000,
            filterFreqEnd: 200,
          }),
        ]);
      case "curse":
        // A dark, dissonant descending drone (two low detuned voices) that
        // fades to a near-silent held hum instead of decaying to nothing —
        // "a mark that lingers", distinct from silence's abrupt cutoff.
        return combineHandles([
          this.engine.playTone({ freq: 180, endFreq: 110, type: "sawtooth", detune: -18, attack: 0.03, decay: 0.2, sustain: 0.15, sustainTime: 0.4, release: 0.5, gain: 0.12 }),
          this.engine.playTone({ freq: 186, endFreq: 114, type: "sawtooth", detune: 18, attack: 0.03, decay: 0.2, sustain: 0.15, sustainTime: 0.4, release: 0.5, gain: 0.1 }),
          this.engine.playNoiseBurst({ duration: 0.35, color: "pink", filterType: "lowpass", filterFreq: 400, gain: 0.08 }),
        ]);
    }
  }
}

/** Fallback element used for statusApplied() when the caller doesn't pass
 * one explicitly — picks the element most associated with each status kind
 * in TowerRegistry.ts (burn->fire, chill/freeze->ice, shock->lightning,
 * root/poison->nature, sunder->earth, silence->arcane), so the elemental
 * base layer still makes sense on its own. */
function statusKindDefaultElement(kind: StatusEffectKind): Element {
  switch (kind) {
    case "burn":
      return "fire";
    case "chill":
    case "freeze":
      return "ice";
    case "shock":
      return "lightning";
    case "root":
    case "poison":
      return "nature";
    case "sunder":
      return "earth";
    case "silence":
      return "arcane";
    case "curse":
      return "shadow";
  }
}
