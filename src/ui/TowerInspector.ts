// Small floating panel for a single selected placed tower: shows its current
// tier/stats and offers Upgrade (to next tier, if any) and Sell actions.
// Mirrors the conventions in ShopPanel/FusionPanel — a dumb display driven
// entirely by the info handed to `show()`; the orchestrator owns all game
// state mutation.

import type { Element, FusionElementPair } from "@/game/types";
import { createElementIcon } from "@/ui/theme";
import { createPanel } from "@/ui/panel";

export interface TowerInspectorInfo {
  name: string;
  element: Element | FusionElementPair;
  tier: 1 | 2 | 3;
  description: string;
  nextTierCost: number | null;
  canAffordUpgrade: boolean;
  sellValue: number;
}

export interface CreateTowerInspectorOptions {
  onUpgrade: () => void;
  onSell: () => void;
}

export interface TowerInspector {
  el: HTMLElement;
  show: (info: TowerInspectorInfo) => void;
  hide: () => void;
  destroy: () => void;
}

export function createTowerInspector(opts: CreateTowerInspectorOptions): TowerInspector {
  const panel = createPanel({ className: "rw-inspector" });
  panel.root.style.display = "none";

  const head = document.createElement("div");
  head.className = "rw-inspector-head";
  const iconWrap = document.createElement("span");
  iconWrap.className = "rw-inspector-icon";
  const titleWrap = document.createElement("div");
  const name = document.createElement("div");
  name.className = "rw-inspector-name";
  const tier = document.createElement("div");
  tier.className = "rw-inspector-tier";
  titleWrap.append(name, tier);
  head.append(iconWrap, titleWrap);

  const desc = document.createElement("div");
  desc.className = "rw-inspector-desc";

  const actions = document.createElement("div");
  actions.className = "rw-inspector-actions";
  const upgradeBtn = document.createElement("button");
  upgradeBtn.type = "button";
  upgradeBtn.className = "rw-btn rw-btn-gold";
  const sellBtn = document.createElement("button");
  sellBtn.type = "button";
  sellBtn.className = "rw-btn rw-btn-ghost";
  sellBtn.textContent = "Sell";
  actions.append(upgradeBtn, sellBtn);

  panel.body.append(head, desc, actions);

  upgradeBtn.addEventListener("click", () => opts.onUpgrade());
  sellBtn.addEventListener("click", () => opts.onSell());

  return {
    el: panel.root,
    show(info) {
      panel.root.style.display = "";
      iconWrap.replaceChildren(createElementIcon(baseElementForIcon(info.element), 28));
      name.textContent = info.name;
      tier.textContent = `Tier ${info.tier}${info.tier === 3 ? " (Max)" : ""}`;
      desc.textContent = info.description;
      sellBtn.textContent = `Sell (+${info.sellValue}g)`;
      if (info.nextTierCost == null) {
        upgradeBtn.textContent = "Max Tier";
        upgradeBtn.disabled = true;
      } else {
        upgradeBtn.textContent = `Upgrade (${info.nextTierCost}g)`;
        upgradeBtn.disabled = !info.canAffordUpgrade;
      }
    },
    hide() {
      panel.root.style.display = "none";
    },
    destroy() {
      panel.root.remove();
    },
  };
}

function baseElementForIcon(element: Element | FusionElementPair): Element {
  return (element.includes("+") ? element.split("+")[0] : element) as Element;
}
