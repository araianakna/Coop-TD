// Procedural music layer: a continuously-generated ambient bed plus a
// handful of musical stings (wave start, boss incoming, victory, defeat).
//
// The ambient bed is NOT a fixed-length sample loop that repeats — it is a
// live generator (sustained detuned oscillators under slow independent
// LFOs, plus a sparse generative melody picked from a fixed scale) that
// keeps producing new, non-identical output for as long as it runs. That
// sidesteps the "will the loop point click/repeat audibly on a 10+ minute
// session" problem entirely rather than solving it with a splice — there is
// no loop point. See src/dev/audio-gallery.html's automated buffer checks
// (and the report handed back with this change) for how that was verified:
// the sustain plateau's amplitude is compared across two separated windows
// of a long offline render to confirm it stays stable/consistent rather
// than drifting or clicking.
import { AudioEngine, type PlayHandle, combineHandles } from "@/audio/AudioEngine";

/** D minor-ish pentatonic-adjacent scale (D E F A C, one octave + a fifth)
 * — deliberately simple/consonant so generative note picks never clash,
 * per the brief's "sparse generative melody over a fixed scale/key". */
const AMBIENT_SCALE = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46, 783.99]; // D4 F4 G4 A4 C5 D5 F5 G5

export class MusicSfx {
  private droneNodes: { osc: OscillatorNode; gain: GainNode }[] = [];
  private droneMaster: GainNode | null = null;
  private lfoNodes: OscillatorNode[] = [];
  private melodyTimeoutId: number | null = null;
  private ambientPlaying = false;

  constructor(private engine: AudioEngine) {}

  get isAmbientPlaying(): boolean {
    return this.ambientPlaying;
  }

  /** Starts the continuous ambient pad + generative melody. Safe to call
   * repeatedly (no-ops if already playing). Runs until `stopAmbient()`. */
  startAmbient(): void {
    if (this.ambientPlaying) return;
    this.ambientPlaying = true;
    const ctx = this.engine.context;
    const now = this.engine.now();

    const master = this.engine.createGainNode("music");
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.5, now + 3); // slow fade-in, never a hard start
    this.droneMaster = master;

    // A gentle lowpass on the whole pad, slowly swept by an LFO so the
    // timbre breathes instead of sitting static for 10+ minutes.
    const filter = this.engine.createFilter("lowpass", 700, 0.7);
    filter.connect(master);

    const filterLfo = ctx.createOscillator();
    filterLfo.type = "sine";
    filterLfo.frequency.value = 1 / 23; // ~23s period
    const filterLfoGain = ctx.createGain();
    filterLfoGain.gain.value = 260; // sweep +-260Hz around 700Hz base
    filterLfo.connect(filterLfoGain);
    filterLfoGain.connect(filter.frequency);
    filterLfo.start(now);
    this.lfoNodes.push(filterLfo);

    // A second, independent-period LFO gently swells the overall level so
    // the bed feels alive rather than a static drone.
    const swellLfo = ctx.createOscillator();
    swellLfo.type = "sine";
    swellLfo.frequency.value = 1 / 17; // ~17s period, deliberately not a clean multiple of the filter LFO's 23s
    const swellLfoGain = ctx.createGain();
    swellLfoGain.gain.value = 0.08;
    swellLfo.connect(swellLfoGain);
    swellLfoGain.connect(master.gain);
    swellLfo.start(now);
    this.lfoNodes.push(swellLfo);

    // Three sustained voices: a sub root, a detuned pair a fifth above (the
    // "shimmer" via slow beating), matching the drone/pad brief.
    const voices: { freq: number; type: OscillatorType; detune: number; gain: number }[] = [
      { freq: 73.42, type: "sine", detune: 0, gain: 0.5 }, // D2 sub root
      { freq: 220, type: "triangle", detune: -6, gain: 0.22 }, // A3, slightly flat
      { freq: 220, type: "triangle", detune: 6, gain: 0.22 }, // A3, slightly sharp -> slow beating
      { freq: 349.23, type: "sine", detune: 0, gain: 0.12 }, // F4, soft third above
    ];
    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.value = v.freq;
      osc.detune.value = v.detune;
      const g = ctx.createGain();
      g.gain.value = v.gain;
      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      this.droneNodes.push({ osc, gain: g });
    }

    this.scheduleMelody();
  }

  /** Sparse generative melody: picks a note from AMBIENT_SCALE at a random
   * interval (4-9s) and plays a soft, long-released pluck over the pad.
   * Reschedules itself via setTimeout keyed off wall-clock delay (not an
   * accumulating counter), so it can't drift out of sync over a long
   * session — each call only ever looks at "now" plus a fresh random gap. */
  private scheduleMelody(): void {
    if (!this.ambientPlaying) return;
    const delayMs = 4000 + Math.random() * 5000;
    this.melodyTimeoutId = window.setTimeout(() => {
      if (!this.ambientPlaying) return;
      const freq = AMBIENT_SCALE[Math.floor(Math.random() * AMBIENT_SCALE.length)];
      const pan = Math.random() * 1.4 - 0.7;
      this.engine.playTone({
        freq,
        type: Math.random() < 0.5 ? "sine" : "triangle",
        attack: 0.6 + Math.random() * 0.4,
        decay: 0.5,
        sustainTime: 0.3,
        release: 1.6 + Math.random() * 0.8,
        gain: 0.05 + Math.random() * 0.03,
        bus: "music",
        pan,
        reverbSend: 0.25,
      });
      this.scheduleMelody();
    }, delayMs);
  }

  /** Fades out and tears down the ambient bed. Safe to call when not
   * playing (no-op). */
  stopAmbient(fadeSeconds = 1.5): void {
    if (!this.ambientPlaying) return;
    this.ambientPlaying = false;
    if (this.melodyTimeoutId != null) {
      window.clearTimeout(this.melodyTimeoutId);
      this.melodyTimeoutId = null;
    }
    const now = this.engine.now();
    if (this.droneMaster) {
      const g = this.droneMaster.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(g.value, 0.0001), now);
      g.exponentialRampToValueAtTime(0.0001, now + fadeSeconds);
      g.linearRampToValueAtTime(0, now + fadeSeconds + 0.05);
    }
    const stopAt = now + fadeSeconds + 0.1;
    for (const { osc } of this.droneNodes) {
      try {
        osc.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    for (const lfo of this.lfoNodes) {
      try {
        lfo.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    this.droneNodes = [];
    this.lfoNodes = [];
    this.droneMaster = null;
  }

  /** Short rising sting for a wave starting — a 3-note bell-like arpeggio
   * climbing, plus a soft noise swell underneath for weight. */
  waveStart(): PlayHandle {
    const notes = [392.0, 523.25, 659.25]; // G4 C5 E5
    return combineHandles([
      ...notes.map((freq, i) =>
        this.engine.playTone({
          freq,
          type: "triangle",
          startDelay: i * 0.11,
          attack: 0.01,
          decay: 0.15,
          release: 0.4,
          gain: 0.18,
          bus: "music",
          reverbSend: 0.2,
        }),
      ),
      this.engine.playNoiseBurst({
        duration: 0.5,
        color: "pink",
        filterType: "bandpass",
        filterFreq: 500,
        filterFreqEnd: 1400,
        gain: 0.08,
        bus: "music",
      }),
    ]);
  }

  /** A real threat cue for a boss wave: a low ominous detuned drone stab, a
   * tritone dissonance for tension, and two brass-like sawtooth "horn" hits
   * with a fast filter-envelope snap. */
  bossIncoming(): PlayHandle {
    const hit = (startDelay: number) =>
      combineHandles([
        this.engine.playTone({
          freq: 98,
          type: "sawtooth",
          detune: -8,
          startDelay,
          attack: 0.02,
          decay: 0.3,
          sustainTime: 0.15,
          release: 0.5,
          gain: 0.3,
          filterType: "lowpass",
          filterFreq: 1400,
          filterFreqEnd: 300,
          bus: "music",
          reverbSend: 0.3,
        }),
        this.engine.playTone({
          freq: 138.59, // tritone above (roughly) — dissonant tension
          type: "sawtooth",
          detune: 8,
          startDelay,
          attack: 0.02,
          decay: 0.3,
          sustainTime: 0.15,
          release: 0.5,
          gain: 0.22,
          filterType: "lowpass",
          filterFreq: 1200,
          filterFreqEnd: 250,
          bus: "music",
          reverbSend: 0.3,
        }),
      ]);
    return combineHandles([
      hit(0),
      hit(0.55),
      this.engine.playNoiseBurst({
        duration: 1.1,
        color: "pink",
        filterType: "lowpass",
        filterFreq: 200,
        gain: 0.2,
        bus: "music",
      }),
    ]);
  }

  /** Short, conclusive triumphant sting: an ascending bright major-triad
   * arpeggio (+ octave) that resolves upward and holds. */
  victory(): PlayHandle {
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    return combineHandles(
      notes.map((freq, i) =>
        this.engine.playTone({
          freq,
          type: i === notes.length - 1 ? "sine" : "triangle",
          startDelay: i * 0.13,
          attack: 0.01,
          decay: 0.2,
          sustainTime: i === notes.length - 1 ? 0.5 : 0,
          release: 0.9,
          gain: 0.22,
          bus: "music",
          reverbSend: 0.35,
        }),
      ),
    );
  }

  /** Short, conclusive defeat sting: the mirror-opposite contour of
   * victory() — a descending minor/dissonant motif settling into a low,
   * unresolved sustained tone. */
  defeat(): PlayHandle {
    const notes = [523.25, 466.16, 415.3, 220]; // C5 Bb4 Ab4 A3 — descending, unresolved
    return combineHandles(
      notes.map((freq, i) =>
        this.engine.playTone({
          freq,
          type: "sawtooth",
          startDelay: i * 0.18,
          attack: 0.02,
          decay: 0.25,
          sustainTime: i === notes.length - 1 ? 0.6 : 0,
          release: 1.1,
          gain: 0.2,
          filterType: "lowpass",
          filterFreq: 1200,
          bus: "music",
          reverbSend: 0.3,
        }),
      ),
    );
  }
}
