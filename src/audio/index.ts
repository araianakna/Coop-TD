// Public entry point for Runeward's audio layer. Single barrel export
// (`AudioSystem`) composing the engine + all four sound modules behind one
// clean API — this is the only import the orchestrator (Game.ts, main.ts,
// the UI panels) should need from src/audio/*.
//
// Everything is procedurally synthesized via Web Audio (see AudioEngine.ts)
// — there are no audio files and no network fetches anywhere in this
// system, matching the "no asset pipeline" constraint the VFX system
// already follows for particles/shaders.
//
// -------------------------------------------------------------------------
// Quick start
// -------------------------------------------------------------------------
//   import { AudioSystem } from "@/audio";
//
//   const audio = new AudioSystem();
//   // Call from inside a real user-gesture handler (click/keydown) — e.g.
//   // StartScreen's map-select click — NOT on page load (autoplay policy).
//   startScreenCard.addEventListener("click", () => { void audio.unlock(); });
//
//   audio.combat.impact("fire", worldPos);
//   audio.combat.enemyDeath(enemy.def.isBoss);
//   audio.combat.enemyLeaked();
//   audio.combat.statusApplied("burn");
//   audio.combat.fusionComplete();
//   audio.combat.towerPlaced();
//   audio.combat.towerUpgraded();
//   audio.combat.towerSold();
//
//   audio.music.startAmbient();   // once, after unlock
//   audio.music.waveStart();
//   audio.music.bossIncoming();
//   audio.music.victory();
//   audio.music.defeat();
//
//   audio.ui.click();
//   audio.ui.hover();
//   audio.ui.denied();
//
//   audio.setMasterVolume(0.8);   // 0..1, also setSfxVolume/setMusicVolume/setUiVolume
//
// -------------------------------------------------------------------------
// Suggested wiring onto Game.ts's event list (Game.ts itself is untouched by
// this change — this is a reference for whoever wires it in next):
//   tryPlaceTower           -> audio.combat.towerPlaced()
//   handleFusionConfirm     -> audio.combat.fusionComplete()
//   handleUpgrade           -> audio.combat.towerUpgraded()
//   handleSell              -> audio.combat.towerSold()
//   fireProjectile          -> audio.combat.projectileFire(element)
//   resolveHit              -> audio.combat.impact(element, pos)
//   triggerAbility           (via applyStatus) -> audio.combat.statusApplied(kind, element)
//   killEnemy               -> audio.combat.enemyDeath(enemy.def.isBoss)
//   updateEnemies (leak branch) -> audio.combat.enemyLeaked()
//   startWave               -> audio.music.waveStart(); if wave.bossId, also audio.music.bossIncoming()
//   checkGameOver           -> audio.music.defeat()
//   updateWaves (victory branch) -> audio.music.victory()
// UI wiring onto src/ui/*: ShopPanel card click -> ui.select()/ui.denied()
// (based on affordability), hover -> ui.hover(), FusionPanel confirm/cancel
// -> ui.click(), TowerInspector upgrade/sell buttons -> ui.click(), panel
// open/close transitions -> ui.panelOpen()/ui.panelClose().
import { AudioEngine, type BusName } from "@/audio/AudioEngine";
import { CombatSfx } from "@/audio/CombatSfx";
import { MusicSfx } from "@/audio/MusicSfx";
import { UiSfx } from "@/audio/UiSfx";

export { AudioEngine, combineHandles, type BusName, type PlayHandle, type ToneOptions, type NoiseBurstOptions } from "@/audio/AudioEngine";
export { ElementSfx, type ElementSoundOptions } from "@/audio/ElementSfx";
export { CombatSfx } from "@/audio/CombatSfx";
export { MusicSfx } from "@/audio/MusicSfx";
export { UiSfx } from "@/audio/UiSfx";

export class AudioSystem {
  readonly engine: AudioEngine;
  readonly combat: CombatSfx;
  readonly music: MusicSfx;
  readonly ui: UiSfx;

  constructor() {
    this.engine = new AudioEngine();
    this.combat = new CombatSfx(this.engine);
    this.music = new MusicSfx(this.engine);
    this.ui = new UiSfx(this.engine);
  }

  /** MUST be called from inside a real user-gesture event handler
   * (click/keydown/pointerdown) — browsers refuse to run an AudioContext
   * otherwise. Safe to call more than once. Resolves to whether audio is
   * now actually running (context.state === "running"). */
  unlock(): Promise<boolean> {
    return this.engine.unlock();
  }

  get isUnlocked(): boolean {
    return this.engine.isUnlocked;
  }

  /** 0..1. Scales everything (sfx + music + ui together). */
  setMasterVolume(v: number): void {
    this.engine.setMasterVolume(v);
  }

  setSfxVolume(v: number): void {
    this.engine.setBusVolume("sfx", v);
  }

  setMusicVolume(v: number): void {
    this.engine.setBusVolume("music", v);
  }

  setUiVolume(v: number): void {
    this.engine.setBusVolume("ui", v);
  }

  getVolume(bus: "master" | BusName): number {
    return bus === "master" ? this.engine.getMasterVolume() : this.engine.getBusVolume(bus);
  }

  /** Stops the ambient bed and releases the AudioContext. Call on full app
   * teardown (not on every restart — Game.ts currently restarts via
   * window.location.reload(), which tears everything down for free). */
  dispose(): void {
    this.music.stopAmbient(0);
    this.engine.dispose();
  }
}
