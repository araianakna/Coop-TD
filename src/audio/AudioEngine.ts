// Core Web Audio engine for Runeward's fully-procedural audio layer. There is
// no asset pipeline and no audio files anywhere in this game — every sound
// (music included) is synthesized at runtime from oscillators and filtered
// noise buffers, the same "build it from primitives, don't load an asset"
// philosophy the VFX system (src/game/vfx/*) applies to particles and
// shaders.
//
// Bus topology:
//
//   OscillatorNode/NoiseSource -> [gain env] -> [filter?] -> [pan?] -\
//                                                                     +-> bus gain (sfx|music|ui) -> master gain -> destination
//                              (optional) -> reverb send -> reverb convolver -> master gain -/
//
// Three independent bus GainNodes (sfx/music/ui) exist so a future
// volume-mixer UI has real per-category sliders to bind to, plus a master
// gain for a single "mute everything" control. See `AudioSystem` in
// src/audio/index.ts for the mixer methods actually exposed to the game.
//
// Autoplay policy: the AudioContext is constructed eagerly in the
// constructor (that's fine — construction is always allowed, only playback
// is gated), but it starts in "suspended" state and produces zero sound
// until `unlock()` is called from inside a real user-gesture handler (click/
// keydown) — e.g. StartScreen's map-select click. Calling any of the
// play*/schedule* methods before unlocking is harmless (nodes get created
// and scheduled, they just don't audibly render until the context resumes).

export type BusName = "sfx" | "music" | "ui";

export interface ToneOptions {
  /** Starting oscillator frequency (Hz). */
  freq: number;
  /** Optional end frequency for a pitch sweep over the note's full length. */
  endFreq?: number;
  /** Use an exponential ramp for the freq->endFreq sweep (more natural for
   * pitch drops) instead of the default linear ramp. */
  sweepExponential?: boolean;
  type?: OscillatorType;
  /** Static detune offset in cents (layer a second slightly-detuned voice for
   * a thicker/shimmering tone — see ElementSfx's arcane sounds). */
  detune?: number;
  /** Seconds to reach peak gain. Default 0.01. */
  attack?: number;
  /** Seconds to decay from peak down to the sustain level. Default 0.1. */
  decay?: number;
  /** 0..1 fraction of peak gain held during the sustain phase. Default 0. */
  sustain?: number;
  /** Seconds the sustain level holds before release begins. Default 0. */
  sustainTime?: number;
  /** Seconds to fade from the sustain level to silence. Default 0.15. */
  release?: number;
  /** Peak linear gain. Default 0.5. */
  gain?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  /** Optional filter cutoff sweep target, ramped over the note's full length. */
  filterFreqEnd?: number;
  filterQ?: number;
  /** -1 (left) .. 1 (right) simple static stereo placement. */
  pan?: number;
  bus?: BusName;
  /** Seconds from "now" to delay the start of this sound. */
  startDelay?: number;
  /** 0..1 amount of this voice sent to the shared reverb bus (spatial depth
   * for big moments — fusion, boss stinger — keep this rare, it's not free). */
  reverbSend?: number;
}

export interface NoiseBurstOptions {
  /** Total seconds the burst plays for (envelope + source lifetime). Also
   * caps how long the underlying buffer source runs — it always stops, it
   * never hangs. */
  duration: number;
  /** Seconds to reach peak gain. Default 0.005 (near-instant — most noise
   * bursts are percussive transients: cracks, thuds, pops). */
  attack?: number;
  /** Seconds to decay to silence. Defaults to filling the rest of `duration`
   * after `attack`. */
  release?: number;
  gain?: number;
  filterType?: BiquadFilterType;
  filterFreq?: number;
  /** Optional filter cutoff sweep target, ramped over `duration`. */
  filterFreqEnd?: number;
  filterQ?: number;
  /** "white" = flat/harsh (sparks, cracks, static); "pink" = warmer/rounder,
   * more low-end energy (thuds, rumbles, wind). */
  color?: "white" | "pink";
  pan?: number;
  bus?: BusName;
  startDelay?: number;
  reverbSend?: number;
}

export interface PlayHandle {
  /** Stop this sound immediately with a short declick fade (~50ms). Safe to
   * call multiple times or after natural completion (no-op). */
  stop(): void;
}

/** exponentialRampToValueAtTime can never target (or leave) an exact 0 — it
 * throws. Every envelope bottoms out at this epsilon, then a final short
 * linearRamp brings it to true 0 so the node is genuinely silent afterward,
 * not just very quiet (avoids very-long-tail hiss and keeps node counts down). */
const MIN_GAIN = 0.0001;

export class AudioEngine {
  readonly context: AudioContext;
  private master: GainNode;
  private buses: Record<BusName, GainNode>;
  private reverbBus: GainNode;
  private reverbConvolver: ConvolverNode | null = null;
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;

  constructor(context?: AudioContext) {
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.context = context ?? new Ctx();

    this.master = this.context.createGain();
    // Default to a comfortably soft level rather than near-full volume —
    // players can always turn it up (or mute entirely via the HUD button),
    // but a quiet-by-default game is a friendlier first impression than a
    // loud one.
    this.master.gain.value = 0.55;
    this.master.connect(this.context.destination);

    this.buses = {
      sfx: this.context.createGain(),
      music: this.context.createGain(),
      ui: this.context.createGain(),
    };
    this.buses.sfx.gain.value = 1;
    this.buses.music.gain.value = 0.55;
    this.buses.ui.gain.value = 0.8;
    for (const bus of Object.values(this.buses)) bus.connect(this.master);

    // Cheap synthesized-impulse reverb send, shared by anything that wants a
    // touch of spatial depth (fusion "wow" moment, boss stinger, ...).
    this.reverbBus = this.context.createGain();
    this.reverbBus.gain.value = 0.6;
    this.reverbBus.connect(this.master);
  }

  // -------------------------------------------------------------------
  // Lifecycle / mixer
  // -------------------------------------------------------------------

  /** Resume the AudioContext. MUST be called from inside a real user-gesture
   * event handler (click/keydown/pointerdown) the first time, per browser
   * autoplay policy — e.g. StartScreen's map-select click. Safe to call
   * repeatedly; no-ops once already running. Resolves to whether audio is
   * now actually running. */
  async unlock(): Promise<boolean> {
    if (this.context.state !== "running") {
      try {
        await this.context.resume();
      } catch {
        // Swallow — caller can retry on the next gesture. Nothing plays
        // until state is "running" regardless.
      }
    }
    return this.context.state === "running";
  }

  get isUnlocked(): boolean {
    return this.context.state === "running";
  }

  now(): number {
    return this.context.currentTime;
  }

  bus(name: BusName): GainNode {
    return this.buses[name];
  }

  setMasterVolume(v: number): void {
    this.master.gain.setTargetAtTime(clamp01(v), this.now(), 0.01);
  }

  setBusVolume(name: BusName, v: number): void {
    this.buses[name].gain.setTargetAtTime(clamp01(v), this.now(), 0.01);
  }

  getMasterVolume(): number {
    return this.master.gain.value;
  }

  getBusVolume(name: BusName): number {
    return this.buses[name].gain.value;
  }

  // -------------------------------------------------------------------
  // Noise buffers (generated once lazily, reused by every noise burst)
  // -------------------------------------------------------------------

  private getNoiseBuffer(color: "white" | "pink"): AudioBuffer {
    if (color === "white") {
      if (!this.whiteNoiseBuffer) this.whiteNoiseBuffer = this.generateWhiteNoise(2);
      return this.whiteNoiseBuffer;
    }
    if (!this.pinkNoiseBuffer) this.pinkNoiseBuffer = this.generatePinkNoise(2);
    return this.pinkNoiseBuffer;
  }

  private generateWhiteNoise(seconds: number): AudioBuffer {
    const length = Math.ceil(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Paul Kellet's "refined" pink-noise approximation — a cheap IIR filter
   * cascade over white noise. Warmer/rounder low-end than flat white, used
   * for thuds/rumbles/wind rather than sparks/cracks. */
  private generatePinkNoise(seconds: number): AudioBuffer {
    const length = Math.ceil(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = pink * 0.11; // roughly renormalize back into +-1 range
    }
    return buffer;
  }

  private ensureReverb(): ConvolverNode {
    if (this.reverbConvolver) return this.reverbConvolver;
    const conv = this.context.createConvolver();
    conv.buffer = this.generateImpulseResponse(1.6, 2.2);
    conv.connect(this.reverbBus);
    this.reverbConvolver = conv;
    return conv;
  }

  /** Synthesizes a plate-ish reverb impulse response: exponentially-decaying
   * stereo noise. No IR sample file, per the "no assets" constraint — this
   * is the audio equivalent of VFX's procedural-everything approach. */
  private generateImpulseResponse(seconds: number, decayPower: number): AudioBuffer {
    const length = Math.ceil(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decayPower);
      }
    }
    return buffer;
  }

  // -------------------------------------------------------------------
  // Low-level primitives — ElementSfx/CombatSfx/MusicSfx/UiSfx build their
  // one-shots and the sustained ambient pad on top of these.
  // -------------------------------------------------------------------

  createGainNode(bus: BusName = "sfx"): GainNode {
    const g = this.context.createGain();
    g.connect(this.buses[bus]);
    return g;
  }

  createFilter(type: BiquadFilterType, freq: number, q = 1): BiquadFilterNode {
    const f = this.context.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  createNoiseSource(color: "white" | "pink" = "white", loop = false): AudioBufferSourceNode {
    const src = this.context.createBufferSource();
    src.buffer = this.getNoiseBuffer(color);
    src.loop = loop;
    return src;
  }

  /** Routes `node` to `amount` (0..1) of the shared reverb send, in addition
   * to whatever `node` is already connected to (the dry path is untouched). */
  sendToReverb(node: AudioNode, amount: number): void {
    if (amount <= 0) return;
    const send = this.context.createGain();
    send.gain.value = clamp01(amount);
    node.connect(send);
    send.connect(this.ensureReverb());
  }

  /** Applies a standard ADSR envelope to a GainNode's `gain` AudioParam
   * starting at `startTime`. Returns the absolute time the sound reaches true
   * silence — callers use it to schedule `stop()` on their source node a hair
   * later. See the MIN_GAIN comment for why exponential ramps bottom out at
   * an epsilon rather than 0. */
  applyEnvelope(
    gain: AudioParam,
    startTime: number,
    opts: { attack: number; decay: number; sustain: number; sustainTime: number; release: number; peak: number },
  ): number {
    const attack = Math.max(opts.attack, 0.002);
    const decay = Math.max(opts.decay, 0.001);
    const sustainTime = Math.max(opts.sustainTime, 0);
    const release = Math.max(opts.release, 0.01);
    const peak = Math.max(opts.peak, MIN_GAIN);

    gain.cancelScheduledValues(startTime);
    gain.setValueAtTime(MIN_GAIN, startTime);
    gain.exponentialRampToValueAtTime(peak, startTime + attack);
    const decayEnd = startTime + attack + decay;
    const sustainVal = Math.max(peak * clamp01(opts.sustain), MIN_GAIN);
    gain.exponentialRampToValueAtTime(sustainVal, decayEnd);
    const releaseStart = decayEnd + sustainTime;
    gain.setValueAtTime(sustainVal, releaseStart);
    const releaseEnd = releaseStart + release;
    gain.exponentialRampToValueAtTime(MIN_GAIN, releaseEnd);
    gain.linearRampToValueAtTime(0, releaseEnd + 0.02);
    return releaseEnd + 0.02;
  }

  // -------------------------------------------------------------------
  // High-level one-shot convenience helpers — cover the large majority of
  // SFX needs without hand-wiring a graph every time.
  // -------------------------------------------------------------------

  /** A single oscillator voice with an ADSR envelope, optional pitch sweep,
   * optional filter (with its own sweep), and optional pan/reverb send. The
   * workhorse behind most ElementSfx/CombatSfx/UiSfx one-shots. */
  playTone(opts: ToneOptions): PlayHandle {
    const startTime = this.now() + Math.max(opts.startDelay ?? 0, 0);
    const attack = opts.attack ?? 0.01;
    const decay = opts.decay ?? 0.1;
    const sustainTime = opts.sustainTime ?? 0;
    const release = opts.release ?? 0.15;
    const totalDur = attack + decay + sustainTime + release;

    const osc = this.context.createOscillator();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(Math.max(opts.freq, 1), startTime);
    if (opts.detune) osc.detune.value = opts.detune;
    if (opts.endFreq != null) {
      const endFreq = Math.max(opts.endFreq, 1);
      if (opts.sweepExponential) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + totalDur);
      } else {
        osc.frequency.linearRampToValueAtTime(endFreq, startTime + totalDur);
      }
    }

    let node: AudioNode = osc;
    let filter: BiquadFilterNode | null = null;
    if (opts.filterType) {
      filter = this.createFilter(opts.filterType, opts.filterFreq ?? 1000, opts.filterQ ?? 1);
      if (opts.filterFreqEnd != null) {
        filter.frequency.setValueAtTime(opts.filterFreq ?? 1000, startTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(opts.filterFreqEnd, 20), startTime + totalDur);
      }
      node.connect(filter);
      node = filter;
    }

    const gainNode = this.context.createGain();
    node.connect(gainNode);

    let outNode: AudioNode = gainNode;
    if (opts.pan != null) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gainNode.connect(panner);
      outNode = panner;
    }
    outNode.connect(this.buses[opts.bus ?? "sfx"]);
    if (opts.reverbSend) this.sendToReverb(gainNode, opts.reverbSend);

    const endTime = this.applyEnvelope(gainNode.gain, startTime, {
      attack,
      decay,
      sustain: opts.sustain ?? 0,
      sustainTime,
      release,
      peak: opts.gain ?? 0.5,
    });

    osc.start(startTime);
    osc.stop(endTime + 0.05);
    osc.onended = () => {
      osc.disconnect();
      filter?.disconnect();
      gainNode.disconnect();
      outNode.disconnect();
    };

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      const t = this.now();
      gainNode.gain.cancelScheduledValues(t);
      gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, MIN_GAIN), t);
      gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN, t + 0.05);
      try {
        osc.stop(t + 0.08);
      } catch {
        /* already scheduled/stopped */
      }
    };
    return { stop };
  }

  /** A filtered-noise burst — the shared "impact"/"crack"/"thud" building
   * block. Duration also caps the underlying buffer playback so it always
   * stops; it never hangs even if `release` is misconfigured. */
  playNoiseBurst(opts: NoiseBurstOptions): PlayHandle {
    const startTime = this.now() + Math.max(opts.startDelay ?? 0, 0);
    const src = this.createNoiseSource(opts.color ?? "white", false);

    let node: AudioNode = src;
    let filter: BiquadFilterNode | null = null;
    if (opts.filterType) {
      filter = this.createFilter(opts.filterType, opts.filterFreq ?? 1000, opts.filterQ ?? 1);
      if (opts.filterFreqEnd != null) {
        filter.frequency.setValueAtTime(opts.filterFreq ?? 1000, startTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(opts.filterFreqEnd, 20), startTime + opts.duration);
      }
      node.connect(filter);
      node = filter;
    }

    const gainNode = this.context.createGain();
    node.connect(gainNode);

    let outNode: AudioNode = gainNode;
    if (opts.pan != null) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      gainNode.connect(panner);
      outNode = panner;
    }
    outNode.connect(this.buses[opts.bus ?? "sfx"]);
    if (opts.reverbSend) this.sendToReverb(gainNode, opts.reverbSend);

    const attack = Math.max(opts.attack ?? 0.005, 0.002);
    const release = Math.max(opts.release ?? Math.max(opts.duration - attack, 0.02), 0.02);
    const peak = Math.max(opts.gain ?? 0.6, MIN_GAIN);

    gainNode.gain.setValueAtTime(MIN_GAIN, startTime);
    gainNode.gain.exponentialRampToValueAtTime(peak, startTime + attack);
    gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN, startTime + attack + release);
    gainNode.gain.linearRampToValueAtTime(0, startTime + attack + release + 0.02);

    const stopTime = startTime + attack + release + 0.05;
    src.start(startTime);
    src.stop(stopTime);
    src.onended = () => {
      src.disconnect();
      filter?.disconnect();
      gainNode.disconnect();
      outNode.disconnect();
    };

    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      const t = this.now();
      gainNode.gain.cancelScheduledValues(t);
      gainNode.gain.setValueAtTime(Math.max(gainNode.gain.value, MIN_GAIN), t);
      gainNode.gain.exponentialRampToValueAtTime(MIN_GAIN, t + 0.05);
      try {
        src.stop(t + 0.08);
      } catch {
        /* already scheduled/stopped */
      }
    };
    return { stop };
  }

  dispose(): void {
    this.master.disconnect();
    void this.context.close();
  }
}

/** Combines several PlayHandles (e.g. the layered voices of one sound
 * effect) into a single handle whose `stop()` stops all of them. */
export function combineHandles(handles: PlayHandle[]): PlayHandle {
  return {
    stop() {
      for (const h of handles) h.stop();
    },
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
