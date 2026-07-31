// Tower shop panel: browsable list of buildable elemental towers.
//
// API:
//   createShopPanel({ towers, economy, onSelect?, selectedId? }) =>
//     { el: HTMLElement; setSelected(id: string | null): void; destroy(): void }
//
// - `towers`: real `TowerDef[]` (base, non-fusion towers). Cost/description
//   are read from `tiers[0]` (a tower's base-build tier); `flavorText` is used
//   as a fallback description if a tier description is empty. Drop real
//   roster data in directly — no shape changes needed.
// - `economy`: used only to reactively toggle the afford/can't-afford visual
//   state as gold changes (never mutated here — spending stays in Game.ts).
// - `onSelect(tower)`: fired when the player clicks/confirms a tower card.
//   Wire this to "enter placement mode for this tower" in the orchestrator.
//   Cards for towers the player can't currently afford are still clickable
//   (so the callback can decide what to do / show a toast) but carry a
//   `.rw-shop-card-locked` visual state.
// - `setSelected(id)`: call this from the orchestrator to reflect which tower
//   (if any) is the currently-armed placement selection.

import type { Economy } from "@/game/economy/Economy";
import type { TowerDef, Element } from "@/game/types";
import { createElementIcon, createGlyphIcon, ELEMENT_THEME } from "@/ui/theme";
import { createPanel } from "@/ui/panel";

export interface CreateShopPanelOptions {
  towers: TowerDef[];
  economy: Economy;
  onSelect?: (tower: TowerDef) => void;
  selectedId?: string | null;
}

export interface ShopPanel {
  el: HTMLElement;
  setSelected: (id: string | null) => void;
  destroy: () => void;
}

export function createShopPanel(opts: CreateShopPanelOptions): ShopPanel {
  const { towers, economy } = opts;
  let selectedId = opts.selectedId ?? null;

  const panel = createPanel({ className: "rw-shop", title: "Elemental Towers" });
  panel.root.classList.add("rw-shop-panel");

  const list = document.createElement("div");
  list.className = "rw-shop-list";
  panel.body.appendChild(list);

  const cards = towers.map((tower) => buildCard(tower, opts.onSelect));
  for (const c of cards) list.appendChild(c.root);

  const render = () => {
    for (const c of cards) c.update(economy.gold, selectedId);
  };

  const unsubscribe = economy.subscribe(render);

  const setSelected = (id: string | null) => {
    selectedId = id;
    render();
  };

  return {
    el: panel.root,
    setSelected,
    destroy: () => unsubscribe(),
  };
}

function buildCard(tower: TowerDef, onSelect: ((tower: TowerDef) => void) | undefined) {
  const tier1 = tower.tiers[0];
  const element = (typeof tower.element === "string" && !tower.element.includes("+")
    ? (tower.element as Element)
    : "arcane") as Element;

  const root = document.createElement("button");
  root.type = "button";
  root.className = "rw-shop-card";
  root.dataset.element = element;

  const icon = createElementIcon(element, 44);
  icon.classList.add("rw-shop-card-icon");
  const lockBadge = document.createElement("span");
  lockBadge.className = "rw-shop-card-lock";
  lockBadge.appendChild(createGlyphIcon("lock", 16));
  icon.appendChild(lockBadge);

  const info = document.createElement("div");
  info.className = "rw-shop-card-info";

  const nameRow = document.createElement("div");
  nameRow.className = "rw-shop-card-name-row";
  const name = document.createElement("span");
  name.className = "rw-shop-card-name";
  name.textContent = tower.name;
  const epithet = document.createElement("span");
  epithet.className = "rw-shop-card-epithet";
  epithet.textContent = ELEMENT_THEME[element].epithet;
  nameRow.append(name, epithet);

  const desc = document.createElement("p");
  desc.className = "rw-shop-card-desc";
  desc.textContent = tier1.description || tower.flavorText;

  info.append(nameRow, desc);

  const costTag = document.createElement("div");
  costTag.className = "rw-shop-card-cost";
  const costIcon = document.createElement("span");
  costIcon.className = "rw-shop-card-cost-coin";
  const costVal = document.createElement("span");
  costVal.textContent = String(tier1.cost);
  costTag.append(costIcon, costVal);

  root.append(icon, info, costTag);

  root.addEventListener("click", () => onSelect?.(tower));

  const update = (gold: number, selectedId: string | null) => {
    const affordable = gold >= tier1.cost;
    root.classList.toggle("rw-shop-card-locked", !affordable);
    root.classList.toggle("rw-shop-card-selected", selectedId === tower.id);
    root.setAttribute("aria-pressed", String(selectedId === tower.id));
  };

  return { root, update };
}
