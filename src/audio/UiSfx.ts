// Short UI stings for the panels in src/ui/*: button hover/click, card
// select, card locked/can't-afford ("denied"), panel open/close. All routed
// through the dedicated "ui" bus (see AudioEngine) so a future mixer can
// duck/mute UI sounds independently of combat SFX and music.
import { AudioEngine, combineHandles, type PlayHandle } from "@/audio/AudioEngine";

export class UiSfx {
  constructor(private engine: AudioEngine) {}

  /** Generic button/card click — a tiny high-passed tick plus a very short
   * sine blip. Used for ShopPanel card confirm, FusionPanel confirm/cancel,
   * TowerInspector upgrade/sell, etc. */
  click(): PlayHandle {
    return combineHandles([
      this.engine.playNoiseBurst({ duration: 0.03, color: "white", filterType: "highpass", filterFreq: 4000, gain: 0.14, bus: "ui" }),
      this.engine.playTone({ freq: 900, endFreq: 1200, type: "sine", attack: 0.002, decay: 0.04, release: 0.05, gain: 0.12, bus: "ui" }),
    ]);
  }

  /** Even softer/shorter than click() — for hover states (ShopPanel cards,
   * buttons) so it reads as a whisper-quiet acknowledgement, not a second
   * click. */
  hover(): PlayHandle {
    return this.engine.playTone({ freq: 1100, type: "sine", attack: 0.002, decay: 0.02, release: 0.03, gain: 0.05, bus: "ui" });
  }

  /** Pleasant confirm blip for selecting a shop/fusion card — a quick
   * upward pitch flick, brighter and slightly longer than click(). */
  select(): PlayHandle {
    return this.engine.playTone({
      freq: 700,
      endFreq: 1050,
      type: "triangle",
      attack: 0.003,
      decay: 0.06,
      release: 0.09,
      gain: 0.16,
      bus: "ui",
    });
  }

  /** "Denied" cue for a locked/can't-afford card — a short buzzy two-note
   * descending "no-no" motif (square wave, deliberately unpleasant/flat),
   * distinct from every other UI sound instead of just silence. */
  denied(): PlayHandle {
    return combineHandles([
      this.engine.playTone({ freq: 220, type: "square", attack: 0.003, decay: 0.05, release: 0.05, gain: 0.14, bus: "ui" }),
      this.engine.playTone({ freq: 165, type: "square", startDelay: 0.09, attack: 0.003, decay: 0.06, release: 0.08, gain: 0.14, bus: "ui" }),
    ]);
  }

  /** Soft rising-filter whoosh for a panel opening (FusionPanel, StartScreen
   * entrance, TowerInspector show). */
  panelOpen(): PlayHandle {
    return this.engine.playNoiseBurst({
      duration: 0.22,
      color: "pink",
      filterType: "bandpass",
      filterFreq: 400,
      filterFreqEnd: 2200,
      filterQ: 1,
      gain: 0.18,
      bus: "ui",
    });
  }

  /** Soft falling-filter whoosh for a panel closing — the mirror of
   * panelOpen(). */
  panelClose(): PlayHandle {
    return this.engine.playNoiseBurst({
      duration: 0.2,
      color: "pink",
      filterType: "bandpass",
      filterFreq: 2000,
      filterFreqEnd: 350,
      filterQ: 1,
      gain: 0.18,
      bus: "ui",
    });
  }
}
