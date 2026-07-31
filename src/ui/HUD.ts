// Top HUD bar: shared gold / lives / wave readout, reactive to Economy.
//
// API:
//   createHUD(economy: Economy) => { el: HTMLElement; destroy(): void }
//
// Mount `el` (position: absolute, top-center by default via ui.css) into the
// host over the canvas. Call `destroy()` to unsubscribe from the economy when
// tearing the HUD down (e.g. on restart if you rebuild it).

import type { Economy, EconomyState } from "@/game/economy/Economy";
import { createGlyphIcon } from "@/ui/theme";

export interface HUD {
  el: HTMLElement;
  destroy: () => void;
}

export function createHUD(economy: Economy): HUD {
  const el = document.createElement("div");
  el.className = "rw-hud";

  const inner = document.createElement("div");
  inner.className = "rw-hud-inner";
  el.appendChild(inner);

  const gold = buildStat("coin", "Gold", "rw-hud-gold");
  const lives = buildStat("heart", "Lives", "rw-hud-lives");
  const wave = buildStat("wave", "Wave", "rw-hud-wave");

  inner.append(gold.root, divider(), lives.root, divider(), wave.root);

  const render = (s: EconomyState) => {
    gold.value.textContent = String(s.gold);
    lives.value.textContent = String(s.lives);
    lives.root.classList.toggle("rw-hud-lives-critical", s.lives > 0 && s.lives <= 5);
    wave.value.textContent = s.wave > 0 ? String(s.wave) : "—";
  };

  const unsubscribe = economy.subscribe(render);

  return {
    el,
    destroy: () => unsubscribe(),
  };
}

function divider(): HTMLElement {
  const d = document.createElement("span");
  d.className = "rw-hud-divider";
  return d;
}

function buildStat(icon: "coin" | "heart" | "wave", label: string, extraClass: string) {
  const root = document.createElement("div");
  root.className = `rw-hud-stat ${extraClass}`;

  const iconWrap = document.createElement("span");
  iconWrap.className = "rw-hud-stat-icon";
  iconWrap.appendChild(createGlyphIcon(icon, 20));

  const textWrap = document.createElement("span");
  textWrap.className = "rw-hud-stat-text";

  const value = document.createElement("span");
  value.className = "rw-hud-stat-value";
  value.textContent = "0";

  const labelEl = document.createElement("span");
  labelEl.className = "rw-hud-stat-label";
  labelEl.textContent = label;

  textWrap.append(value, labelEl);
  root.append(iconWrap, textWrap);

  return { root, value };
}
