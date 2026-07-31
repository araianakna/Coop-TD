// Standalone dev harness for src/audio/* — a separate Vite entry
// (src/dev/audio-gallery.html), not wired into the main game. Lays out one
// button per synthesized sound, grouped by category, so a human can click
// through and listen (the manual-QA counterpart to the automated
// OfflineAudioContext buffer checks used to verify correctness — see the
// report handed back with this change for that methodology).
import { AudioSystem } from "@/audio";
import { ELEMENTS, type Element, type StatusEffectKind } from "@/game/types";
import { ELEMENT_THEME } from "@/ui/theme";

const gallery = document.getElementById("gallery")!;
const statusEl = document.getElementById("status")!;
const unlockBtn = document.getElementById("unlock-btn") as HTMLButtonElement;

const audio = new AudioSystem();
(window as unknown as { __audio: AudioSystem }).__audio = audio; // for console poking

let ambientPlaying = false;
const allButtons: HTMLButtonElement[] = [];

function setUnlockedUi(unlocked: boolean) {
  statusEl.textContent = unlocked ? "unlocked — audio running" : "locked — click Unlock Audio";
  statusEl.classList.toggle("locked", !unlocked);
  for (const b of allButtons) b.disabled = !unlocked;
}

unlockBtn.addEventListener("click", async () => {
  const ok = await audio.unlock();
  setUnlockedUi(ok);
});

// Mixer sliders
const volMaster = document.getElementById("vol-master") as HTMLInputElement;
const volSfx = document.getElementById("vol-sfx") as HTMLInputElement;
const volMusic = document.getElementById("vol-music") as HTMLInputElement;
const volUi = document.getElementById("vol-ui") as HTMLInputElement;
volMaster.addEventListener("input", () => audio.setMasterVolume(Number(volMaster.value)));
volSfx.addEventListener("input", () => audio.setSfxVolume(Number(volSfx.value)));
volMusic.addEventListener("input", () => audio.setMusicVolume(Number(volMusic.value)));
volUi.addEventListener("input", () => audio.setUiVolume(Number(volUi.value)));

// -------------------------------------------------------------------------
// Layout helpers
// -------------------------------------------------------------------------

function section(title: string, note?: string): HTMLElement {
  const sec = document.createElement("section");
  const h = document.createElement("h2");
  h.textContent = title;
  sec.appendChild(h);
  if (note) {
    const p = document.createElement("p");
    p.className = "note";
    p.textContent = note;
    sec.appendChild(p);
  }
  const grid = document.createElement("div");
  grid.className = "grid";
  sec.appendChild(grid);
  gallery.appendChild(sec);
  return grid;
}

function addButton(grid: HTMLElement, label: string, swatch: string | null, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.disabled = true;
  if (swatch) {
    const dot = document.createElement("span");
    dot.className = "swatch";
    dot.style.background = swatch;
    btn.appendChild(dot);
  }
  btn.appendChild(document.createTextNode(label));
  btn.addEventListener("click", async () => {
    if (!audio.isUnlocked) {
      const ok = await audio.unlock();
      setUnlockedUi(ok);
    }
    onClick();
  });
  grid.appendChild(btn);
  allButtons.push(btn);
  return btn;
}

// -------------------------------------------------------------------------
// Element SFX — launch / impact / abilityCast x 6 elements
// -------------------------------------------------------------------------

for (const kind of ["launch", "impact", "abilityCast"] as const) {
  const label = kind === "launch" ? "Projectile Launch" : kind === "impact" ? "Impact" : "Ability Cast Flourish";
  const grid = section(
    `Element SFX — ${label}`,
    "Every element should be distinguishable blind — different oscillator/filter/noise recipe per element, not a shared function with a color swapped.",
  );
  for (const el of ELEMENTS) {
    addButton(grid, `${ELEMENT_THEME[el].label} (${ELEMENT_THEME[el].epithet})`, ELEMENT_THEME[el].color, () => {
      audio.combat.element[kind](el as Element);
    });
  }
}

// -------------------------------------------------------------------------
// Combat SFX
// -------------------------------------------------------------------------

{
  const grid = section("Combat — Enemy Lifecycle");
  addButton(grid, "Enemy Death (normal)", null, () => audio.combat.enemyDeath(false));
  addButton(grid, "Enemy Death (BOSS)", "#ffb14d", () => audio.combat.enemyDeath(true));
  addButton(grid, "Enemy Leaked (failure cue)", "#ff5a5a", () => audio.combat.enemyLeaked());
}

{
  const grid = section("Combat — Tower Actions");
  addButton(grid, "Tower Placed", null, () => audio.combat.towerPlaced());
  addButton(grid, "Tower Upgraded", null, () => audio.combat.towerUpgraded());
  addButton(grid, "Tower Sold", null, () => audio.combat.towerSold());
  addButton(grid, "Fusion Complete (multi-stage)", "#e28bff", () => audio.combat.fusionComplete());
}

{
  const STATUS_KINDS: StatusEffectKind[] = ["burn", "chill", "freeze", "shock", "root", "poison", "sunder", "silence"];
  const grid = section("Combat — Status Applied (by statusKind)", "Elemental impact layer + a bespoke per-kind identity layer.");
  for (const kind of STATUS_KINDS) {
    addButton(grid, kind, null, () => audio.combat.statusApplied(kind));
  }
}

// -------------------------------------------------------------------------
// Music
// -------------------------------------------------------------------------

{
  const grid = section("Music", "Ambient bed is a continuous generator, not a spliced loop — toggle it and let it run for a while.");
  const ambientBtn = addButton(grid, "Start Ambient Bed", null, () => {
    if (ambientPlaying) {
      audio.music.stopAmbient();
      ambientPlaying = false;
      ambientBtn.textContent = "Start Ambient Bed";
      ambientBtn.classList.remove("toggle-on");
    } else {
      audio.music.startAmbient();
      ambientPlaying = true;
      ambientBtn.textContent = "Stop Ambient Bed";
      ambientBtn.classList.add("toggle-on");
    }
  });
  addButton(grid, "Wave Start Sting", null, () => audio.music.waveStart());
  addButton(grid, "Boss Incoming Stinger", "#ffb14d", () => audio.music.bossIncoming());
  addButton(grid, "Victory Sting", "#8ee6a0", () => audio.music.victory());
  addButton(grid, "Defeat Sting", "#ff9a8b", () => audio.music.defeat());
}

// -------------------------------------------------------------------------
// UI SFX
// -------------------------------------------------------------------------

{
  const grid = section("UI");
  addButton(grid, "Click", null, () => audio.ui.click());
  addButton(grid, "Hover", null, () => audio.ui.hover());
  addButton(grid, "Card Select", null, () => audio.ui.select());
  addButton(grid, "Denied (locked/can't-afford)", "#ff9a8b", () => audio.ui.denied());
  addButton(grid, "Panel Open", null, () => audio.ui.panelOpen());
  addButton(grid, "Panel Close", null, () => audio.ui.panelClose());
}

setUnlockedUi(audio.isUnlocked);
