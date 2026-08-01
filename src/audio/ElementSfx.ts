// Per-element sound identity — the audio equivalent of
// src/game/vfx/palette.ts's ELEMENT_PALETTES / src/ui/theme.ts's
// ELEMENT_THEME. Every element gets three bespoke sounds (not one shared
// function with a frequency swapped in — a genuinely different oscillator/
// noise/filter recipe per element, the same way AbilityVfx gives every
// ability its own shape rather than recoloring one burst):
//
//   launch(element)      — projectile leaving the tower
//   impact(element)      — projectile landing / hit resolving
//   abilityCast(element) — generic "ability just fired" flourish
//
// Target identity per element (mirrors the palette/epithet vocabulary from
// theme.ts so the sound design stays traceable to the established art
// direction):
//   fire      "Scorch"   — warm sawtooth thump + crackling mid-band noise, roars
//   ice       "Frost"    — bright harmonic sine chimes, glassy high transients
//   lightning "Storm"    — sharp broadband crack + buzzy fast-wobble zap
//   nature    "Growth"   — soft pentatonic plucks + low wood-knock thunk
//   earth     "Stone"    — deep pitch-drop thud + low rumble, longest release
//   arcane    "Mystery"  — detuned twin oscillators (shimmer/beat), airy sparkle
//
// Each function returns a single PlayHandle (via combineHandles) covering
// every layered voice, so callers can cut a sound short if needed without
// caring how many oscillators/noise bursts it's built from underneath.
import type { Element } from "@/game/types";
import { AudioEngine, combineHandles, type PlayHandle } from "@/audio/AudioEngine";

export interface ElementSoundOptions {
  /** 0..1 multiplier applied to every layer's gain (e.g. quieter secondary
   * splash hits, or a louder boss-scale ability cast). Default 1. */
  intensity?: number;
  /** -1..1 static stereo placement, forwarded to every layer. */
  pan?: number;
}

/** Small fixed pentatonic-ish note pools so pitched per-element sounds vary
 * take to take without ever landing on a dissonant interval — "generative
 * within a scale", same idea MusicSfx uses for the ambient melody. */
const NATURE_NOTES = [329.63, 369.99, 415.3, 493.88, 554.37]; // E4 F#4 G#4 B4 C#5 (E major pentatonic-ish)
const ICE_NOTES = [880, 987.77, 1108.73, 1318.51]; // A5 B5 C#6 E6 — bright, airy
const ARCANE_NOTES = [493.88, 587.33, 739.99]; // B4 D5 F#5
const SHADOW_NOTES = [110, 116.54, 130.81]; // A2 Bb2 C3 — a tight, unsettling low cluster

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class ElementSfx {
  constructor(private engine: AudioEngine) {}

  launch(element: Element, opts: ElementSoundOptions = {}): PlayHandle {
    const g = opts.intensity ?? 1;
    const pan = opts.pan;
    switch (element) {
      case "fire":
        return combineHandles([
          this.engine.playNoiseBurst({
            duration: 0.16,
            color: "pink",
            filterType: "bandpass",
            filterFreq: 1400,
            filterFreqEnd: 500,
            filterQ: 0.9,
            gain: 0.28 * g,
            pan,
          }),
          this.engine.playTone({
            freq: 260,
            endFreq: 140,
            type: "sawtooth",
            attack: 0.005,
            decay: 0.08,
            release: 0.08,
            gain: 0.16 * g,
            filterType: "lowpass",
            filterFreq: 1800,
            pan,
          }),
        ]);
      case "ice":
        return combineHandles([
          this.engine.playTone({
            freq: 1500,
            endFreq: 1900,
            type: "sine",
            attack: 0.002,
            decay: 0.05,
            release: 0.05,
            gain: 0.2 * g,
            pan,
          }),
          this.engine.playNoiseBurst({
            duration: 0.08,
            color: "white",
            filterType: "highpass",
            filterFreq: 5000,
            gain: 0.1 * g,
            pan,
          }),
        ]);
      case "lightning":
        return combineHandles([
          this.engine.playNoiseBurst({
            duration: 0.06,
            color: "white",
            filterType: "highpass",
            filterFreq: 3500,
            filterQ: 0.7,
            gain: 0.3 * g,
            pan,
          }),
          this.engine.playTone({
            freq: 1800,
            endFreq: 300,
            type: "square",
            sweepExponential: true,
            attack: 0.002,
            decay: 0.05,
            release: 0.03,
            gain: 0.1 * g,
            pan,
          }),
        ]);
      case "nature":
        return combineHandles([
          this.engine.playTone({
            freq: pick(NATURE_NOTES),
            type: "triangle",
            attack: 0.01,
            decay: 0.12,
            release: 0.14,
            gain: 0.2 * g,
            filterType: "lowpass",
            filterFreq: 2400,
            pan,
          }),
        ]);
      case "earth":
        return combineHandles([
          this.engine.playTone({
            freq: 130,
            endFreq: 70,
            type: "sine",
            attack: 0.004,
            decay: 0.1,
            release: 0.16,
            gain: 0.3 * g,
            pan,
          }),
          this.engine.playNoiseBurst({
            duration: 0.14,
            color: "pink",
            filterType: "lowpass",
            filterFreq: 350,
            gain: 0.18 * g,
            pan,
          }),
        ]);
      case "arcane":
        return combineHandles([
          this.engine.playTone({
            freq: pick(ARCANE_NOTES),
            type: "sine",
            detune: -12,
            attack: 0.01,
            decay: 0.1,
            release: 0.16,
            gain: 0.14 * g,
            pan,
          }),
          this.engine.playTone({
            freq: pick(ARCANE_NOTES),
            type: "sine",
            detune: 14,
            attack: 0.012,
            decay: 0.1,
            release: 0.18,
            gain: 0.12 * g,
            pan,
          }),
        ]);
      case "shadow":
        // Breathy high-passed hiss swelling in (slow attack, unlike every
        // other element's sharp launch transient) under a low dissonant
        // drone — reads as "arriving from nowhere" rather than being fired.
        return combineHandles([
          this.engine.playNoiseBurst({ duration: 0.22, color: "white", filterType: "highpass", filterFreq: 3200, gain: 0.08 * g, pan }),
          this.engine.playTone({ freq: pick(SHADOW_NOTES), type: "sawtooth", attack: 0.09, decay: 0.06, release: 0.14, gain: 0.09 * g, pan }),
        ]);
    }
  }

  impact(element: Element, opts: ElementSoundOptions = {}): PlayHandle {
    const g = opts.intensity ?? 1;
    const pan = opts.pan;
    switch (element) {
      case "fire":
        // Crackling roar: two staggered noise crackles under a low thumping
        // pitch drop — reads as "hit and caught fire", not just "hit".
        return combineHandles([
          this.engine.playTone({
            freq: 180,
            endFreq: 90,
            type: "triangle",
            attack: 0.004,
            decay: 0.1,
            release: 0.2,
            gain: 0.32 * g,
            filterType: "lowpass",
            filterFreq: 1200,
            pan,
          }),
          this.engine.playNoiseBurst({
            duration: 0.3,
            color: "pink",
            filterType: "bandpass",
            filterFreq: 1800,
            filterFreqEnd: 600,
            filterQ: 0.8,
            gain: 0.3 * g,
            pan,
          }),
          this.engine.playNoiseBurst({
            duration: 0.16,
            startDelay: 0.05,
            color: "white",
            filterType: "bandpass",
            filterFreq: 2600,
            filterQ: 1.4,
            gain: 0.12 * g,
            pan,
          }),
        ]);
      case "ice":
        // Glassy chime: three harmonically-related sines (root, fifth,
        // octave) plus a sharp high-passed noise "shard" transient.
        return combineHandles([
          this.engine.playTone({ freq: 1046.5, type: "sine", attack: 0.002, decay: 0.14, release: 0.22, gain: 0.22 * g, pan }),
          this.engine.playTone({ freq: 1567.98, type: "sine", attack: 0.002, decay: 0.12, release: 0.18, gain: 0.14 * g, pan }),
          this.engine.playTone({ freq: 2093, type: "sine", attack: 0.002, decay: 0.1, release: 0.14, gain: 0.09 * g, pan }),
          this.engine.playNoiseBurst({
            duration: 0.1,
            color: "white",
            filterType: "highpass",
            filterFreq: 6000,
            gain: 0.18 * g,
            pan,
          }),
        ]);
      case "lightning":
        // Louder/sharper than the launch crack, plus a buzzy sawtooth with a
        // fast pitch wobble (detuned oscillator beating) for "zap" texture.
        return combineHandles([
          this.engine.playNoiseBurst({
            duration: 0.1,
            color: "white",
            filterType: "highpass",
            filterFreq: 2800,
            filterQ: 0.6,
            gain: 0.36 * g,
            pan,
          }),
          this.engine.playTone({
            freq: 2200,
            endFreq: 220,
            type: "sawtooth",
            sweepExponential: true,
            attack: 0.001,
            decay: 0.08,
            release: 0.06,
            gain: 0.16 * g,
            pan,
          }),
          this.engine.playTone({
            freq: 2200,
            endFreq: 220,
            type: "sawtooth",
            sweepExponential: true,
            detune: 25,
            attack: 0.001,
            decay: 0.08,
            release: 0.06,
            gain: 0.1 * g,
            pan,
          }),
        ]);
      case "nature":
        // Wood-knock: a low-mid bandpass noise thunk under a soft pitched
        // overtone — a hollow "thock" rather than a chime.
        return combineHandles([
          this.engine.playNoiseBurst({
            duration: 0.12,
            color: "pink",
            filterType: "bandpass",
            filterFreq: 350,
            filterQ: 3,
            gain: 0.26 * g,
            pan,
          }),
          this.engine.playTone({
            freq: pick(NATURE_NOTES) * 0.5,
            type: "triangle",
            attack: 0.006,
            decay: 0.1,
            release: 0.16,
            gain: 0.14 * g,
            pan,
          }),
        ]);
      case "earth":
        // Deep thud + low rumble tail — the heaviest, longest-release impact
        // of the six, by design (earth = "Stone").
        return combineHandles([
          this.engine.playTone({
            freq: 100,
            endFreq: 45,
            type: "sine",
            attack: 0.003,
            decay: 0.14,
            release: 0.32,
            gain: 0.4 * g,
            pan,
          }),
          this.engine.playNoiseBurst({
            duration: 0.4,
            color: "pink",
            filterType: "lowpass",
            filterFreq: 220,
            gain: 0.24 * g,
            pan,
          }),
        ]);
      case "arcane":
        // Shimmering: three detuned sines (beating chorus) fading under a
        // sparkly high bandpass noise sweep rising then falling.
        return combineHandles([
          this.engine.playTone({ freq: 587.33, type: "triangle", detune: -18, attack: 0.008, decay: 0.14, release: 0.28, gain: 0.16 * g, pan }),
          this.engine.playTone({ freq: 587.33, type: "triangle", detune: 18, attack: 0.008, decay: 0.14, release: 0.28, gain: 0.16 * g, pan }),
          this.engine.playTone({ freq: 1174.66, type: "sine", detune: 8, attack: 0.01, decay: 0.12, release: 0.2, gain: 0.1 * g, pan }),
          this.engine.playNoiseBurst({
            duration: 0.24,
            color: "white",
            filterType: "bandpass",
            filterFreq: 3000,
            filterFreqEnd: 7000,
            filterQ: 2.5,
            gain: 0.12 * g,
            pan,
          }),
        ]);
      case "shadow":
        // Low dissonant thud (two close-tuned voices beating) under a dark
        // lowpassed noise thump — heavier and murkier than earth's clean
        // rumble, with an unresolved, slightly sour interval.
        return combineHandles([
          this.engine.playTone({ freq: pick(SHADOW_NOTES), type: "sawtooth", detune: -14, attack: 0.005, decay: 0.16, release: 0.32, gain: 0.15 * g, pan }),
          this.engine.playTone({ freq: pick(SHADOW_NOTES), type: "sawtooth", detune: 14, attack: 0.005, decay: 0.16, release: 0.32, gain: 0.13 * g, pan }),
          this.engine.playNoiseBurst({ duration: 0.3, color: "pink", filterType: "lowpass", filterFreq: 260, gain: 0.16 * g, pan }),
        ]);
    }
  }

  /** Generic "an ability just fired" flourish per element — used by
   * CombatSfx as a light layer under the more specific statusApplied()
   * sound when a tower's ability triggers. Longer and more "cast"-feeling
   * than impact(), shorter than a full multi-stage sequence. */
  abilityCast(element: Element, opts: ElementSoundOptions = {}): PlayHandle {
    const g = opts.intensity ?? 1;
    const pan = opts.pan;
    switch (element) {
      case "fire":
        return combineHandles([
          this.engine.playTone({
            freq: 180,
            endFreq: 520,
            type: "sawtooth",
            attack: 0.02,
            decay: 0.14,
            release: 0.1,
            gain: 0.18 * g,
            filterType: "lowpass",
            filterFreq: 2200,
            pan,
          }),
          this.engine.playNoiseBurst({ duration: 0.12, color: "pink", filterType: "bandpass", filterFreq: 1600, gain: 0.16 * g, pan }),
          this.engine.playNoiseBurst({ duration: 0.14, startDelay: 0.09, color: "pink", filterType: "bandpass", filterFreq: 2000, gain: 0.12 * g, pan }),
        ]);
      case "ice":
        return combineHandles(
          ICE_NOTES.map((freq, i) =>
            this.engine.playTone({
              freq,
              type: "sine",
              startDelay: i * 0.05,
              attack: 0.003,
              decay: 0.08,
              release: 0.16,
              gain: (0.16 - i * 0.02) * g,
              pan,
            }),
          ),
        );
      case "lightning":
        return combineHandles([
          ...Array.from({ length: 5 }, (_, i) =>
            this.engine.playNoiseBurst({
              duration: 0.03,
              startDelay: i * 0.035 + Math.random() * 0.01,
              color: "white",
              filterType: "highpass",
              filterFreq: 3500,
              gain: 0.14 * g,
              pan,
            }),
          ),
          this.engine.playTone({
            freq: 220,
            endFreq: 900,
            type: "sawtooth",
            attack: 0.15,
            decay: 0.02,
            release: 0.05,
            gain: 0.12 * g,
            pan,
          }),
        ]);
      case "nature":
        return combineHandles([
          this.engine.playTone({
            freq: pick(NATURE_NOTES),
            type: "sine",
            detune: 6,
            attack: 0.15,
            decay: 0.15,
            sustainTime: 0.1,
            release: 0.3,
            gain: 0.16 * g,
            pan,
          }),
          this.engine.playNoiseBurst({
            duration: 0.35,
            color: "pink",
            filterType: "bandpass",
            filterFreq: 700,
            filterQ: 1.2,
            gain: 0.1 * g,
            pan,
          }),
        ]);
      case "earth":
        return combineHandles([
          this.engine.playTone({
            freq: 90,
            endFreq: 55,
            type: "sine",
            attack: 0.01,
            decay: 0.16,
            release: 0.35,
            gain: 0.3 * g,
            pan,
          }),
          this.engine.playNoiseBurst({ duration: 0.5, color: "pink", filterType: "lowpass", filterFreq: 260, gain: 0.22 * g, pan }),
          this.engine.playNoiseBurst({
            duration: 0.1,
            startDelay: 0.03,
            color: "white",
            filterType: "bandpass",
            filterFreq: 1000,
            gain: 0.1 * g,
            pan,
          }),
        ]);
      case "arcane":
        // Filter sweeps up while a detuned pair fades — "suppression"
        // motif, matching the arcane ability vocabulary (Silence/Wither
        // implode inward in the VFX layer).
        return combineHandles([
          this.engine.playTone({ freq: 440, type: "triangle", detune: -20, attack: 0.05, decay: 0.2, release: 0.3, gain: 0.14 * g, pan }),
          this.engine.playTone({ freq: 440, type: "triangle", detune: 20, attack: 0.05, decay: 0.2, release: 0.3, gain: 0.14 * g, pan }),
          this.engine.playNoiseBurst({
            duration: 0.4,
            color: "white",
            filterType: "bandpass",
            filterFreq: 1200,
            filterFreqEnd: 4500,
            filterQ: 3,
            gain: 0.1 * g,
            pan,
          }),
        ]);
      case "shadow":
        // A slow-swelling dissonant drone (long attack, unlike arcane's
        // sweep) under a breathy whisper-band noise sweep — the "cast" reads
        // as a held brand settling into place, not a burst of energy.
        return combineHandles([
          this.engine.playTone({ freq: pick(SHADOW_NOTES), type: "sawtooth", detune: -16, attack: 0.14, decay: 0.18, release: 0.4, gain: 0.13 * g, pan }),
          this.engine.playTone({ freq: pick(SHADOW_NOTES), type: "sawtooth", detune: 16, attack: 0.14, decay: 0.18, release: 0.4, gain: 0.11 * g, pan }),
          this.engine.playNoiseBurst({
            duration: 0.45,
            color: "white",
            filterType: "bandpass",
            filterFreq: 2400,
            filterFreqEnd: 900,
            filterQ: 2,
            gain: 0.09 * g,
            pan,
          }),
        ]);
    }
  }
}
