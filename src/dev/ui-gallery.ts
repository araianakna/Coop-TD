// Standalone dev harness for src/ui/* components. Not part of the game build
// — a separate Vite entry (src/dev/ui-gallery.html) for visual QA. Mounts
// every component with mock data covering every documented visual state.

import "@/ui/ui.css";
import { Economy } from "@/game/economy/Economy";
import type { TowerDef, TowerTierDef } from "@/game/types";
import { createHUD } from "@/ui/HUD";
import { createShopPanel } from "@/ui/ShopPanel";
import { createFusionPanel, type FusionCandidatePair } from "@/ui/FusionPanel";
import { createCursorIndicators } from "@/ui/CursorIndicators";
import { createVictoryScreen, createDefeatScreen } from "@/ui/EndScreens";

const gallery = document.getElementById("gallery")!;

function section(title: string): { section: HTMLElement; stage: HTMLElement } {
  const sec = document.createElement("div");
  sec.className = "gallery-section";
  const h = document.createElement("h2");
  h.textContent = title;
  sec.appendChild(h);
  const stage = document.createElement("div");
  stage.className = "gallery-stage";
  stage.style.position = "relative";
  sec.appendChild(stage);
  gallery.appendChild(sec);
  return { section: sec, stage };
}

function tier(cost: number, description: string): TowerTierDef {
  return {
    tier: 1,
    stats: { damage: 12, range: 4.5, fireRateMs: 600, projectileSpeed: 9 },
    cost,
    modelScale: 1,
    description,
  };
}

function mockTower(
  id: string,
  name: string,
  element: TowerDef["element"],
  cost: number,
  description: string,
  flavorText: string,
): TowerDef {
  return {
    id,
    name,
    element,
    isFusion: false,
    flavorText,
    tiers: [
      tier(cost, description),
      tier(Math.round(cost * 2.4), description),
      tier(Math.round(cost * 4.2), description),
    ],
    abilities: [],
    targeting: "closest",
    projectileVfx: "",
    impactVfx: "",
    modelId: id,
  };
}

const MOCK_TOWERS: TowerDef[] = [
  mockTower("t-fire", "Ember Turret", "fire", 25, "Launches bolts that burn over time.", "Forged in the heart of a dying star."),
  mockTower("t-ice", "Glacier Spire", "ice", 30, "Slows enemies caught in its frost.", "Cut from a glacier that never melts."),
  mockTower("t-lightning", "Storm Coil", "lightning", 45, "Chains damage between close foes.", "Crackles with a captive thunderhead."),
  mockTower("t-nature", "Thornbrake", "nature", 20, "Roots enemies in creeping vines.", "Grown from a seed older than the keep."),
  mockTower("t-earth", "Stonewarden", "earth", 60, "Slow, heavy hits that shatter armor.", "A sentinel carved from mountain-root."),
  mockTower("t-arcane", "Rune Obelisk", "arcane", 80, "Pierces resistances with raw mana.", "Hums with an unreadable, older language."),
];

/* --------------------------------------------------------------------- */
/* 1. HUD                                                                  */
/* --------------------------------------------------------------------- */
{
  const { stage } = section("HUD — normal vs critical-lives state, plus live poke controls");
  stage.style.display = "flex";
  stage.style.flexDirection = "column";
  stage.style.gap = "16px";
  stage.style.padding = "18px 0 60px";

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "24px";
  row.style.justifyContent = "center";
  row.style.position = "relative";
  row.style.height = "70px";
  stage.appendChild(row);

  const normalWrap = document.createElement("div");
  normalWrap.style.position = "relative";
  normalWrap.style.flex = "1";
  normalWrap.style.height = "70px";
  const normalEconomy = new Economy(240, 18);
  normalEconomy.setWave(4);
  const normalHud = createHUD(normalEconomy);
  normalHud.el.style.position = "absolute";
  normalHud.el.style.top = "0";
  normalHud.el.style.left = "50%";
  normalWrap.appendChild(normalHud.el);
  row.appendChild(normalWrap);

  const criticalWrap = document.createElement("div");
  criticalWrap.style.position = "relative";
  criticalWrap.style.flex = "1";
  criticalWrap.style.height = "70px";
  const criticalEconomy = new Economy(15, 20);
  criticalEconomy.loseLife(17);
  criticalEconomy.setWave(9);
  const criticalHud = createHUD(criticalEconomy);
  criticalHud.el.style.position = "absolute";
  criticalHud.el.style.top = "0";
  criticalHud.el.style.left = "50%";
  criticalWrap.appendChild(criticalHud.el);
  row.appendChild(criticalWrap);

  const liveWrap = document.createElement("div");
  liveWrap.style.position = "relative";
  liveWrap.style.height = "70px";
  liveWrap.style.marginTop = "20px";
  const liveEconomy = new Economy(150, 20);
  const liveHud = createHUD(liveEconomy);
  liveHud.el.style.position = "absolute";
  liveHud.el.style.top = "0";
  liveHud.el.style.left = "50%";
  liveWrap.appendChild(liveHud.el);
  stage.appendChild(liveWrap);

  const toolbar = document.createElement("div");
  toolbar.className = "gallery-toolbar";
  toolbar.style.marginTop = "24px";
  const addBtn = (label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.onclick = fn;
    toolbar.appendChild(b);
  };
  addBtn("+50 Gold", () => liveEconomy.earn(50));
  addBtn("-25 Gold", () => liveEconomy.spend(25));
  addBtn("Lose 1 Life", () => liveEconomy.loseLife(1));
  addBtn("Next Wave", () => liveEconomy.setWave(liveEconomy.wave + 1));
  stage.appendChild(toolbar);

  const caption = document.createElement("div");
  caption.className = "gallery-caption";
  caption.textContent = "Left: normal. Right: critical lives (<=5) pulse state. Bottom: interactive.";
  stage.appendChild(caption);
}

/* --------------------------------------------------------------------- */
/* 2. Shop panel                                                          */
/* --------------------------------------------------------------------- */
{
  const { stage } = section("Shop panel — affordable (500g) vs mostly locked (20g)");
  stage.style.display = "flex";
  stage.style.gap = "24px";
  stage.style.padding = "18px";
  stage.style.alignItems = "flex-start";
  stage.style.flexWrap = "wrap";

  const richEconomy = new Economy(500, 20);
  const richShop = createShopPanel({
    towers: MOCK_TOWERS,
    economy: richEconomy,
    onSelect: (t) => richShop.setSelected(t.id),
  });
  richShop.setSelected("t-fire");
  stage.appendChild(richShop.el);

  const poorEconomy = new Economy(20, 20);
  const poorShop = createShopPanel({
    towers: MOCK_TOWERS,
    economy: poorEconomy,
    onSelect: (t) => poorShop.setSelected(t.id),
  });
  stage.appendChild(poorShop.el);
}

/* --------------------------------------------------------------------- */
/* 3. Fusion panel                                                        */
/* --------------------------------------------------------------------- */
{
  const { stage } = section("Fusion panel — open with candidates (1 locked) vs empty state");
  stage.style.display = "flex";
  stage.style.gap = "24px";
  stage.style.padding = "18px";
  stage.style.alignItems = "flex-start";
  stage.style.flexWrap = "wrap";

  const pairs: FusionCandidatePair[] = [
    {
      id: "pair-fire-ice",
      towerA: { id: "tower-1", name: "Ember Turret", element: "fire" },
      towerB: { id: "tower-2", name: "Glacier Spire", element: "ice" },
      resultName: "Steamcaller",
      resultElementPair: "fire+ice",
      flavorText: "Boils foes alive in scalding vapor.",
      cost: 40,
      affordable: true,
    },
    {
      id: "pair-lightning-nature",
      towerA: { id: "tower-3", name: "Storm Coil", element: "lightning" },
      towerB: { id: "tower-4", name: "Thornbrake", element: "nature" },
      resultName: "Verdant Storm",
      resultElementPair: "lightning+nature",
      flavorText: "Chain lightning arcs through living vines.",
      cost: 90,
      affordable: false,
    },
  ];

  const openPanel = createFusionPanel({
    getCandidatePairs: () => pairs,
    onConfirm: (id) => console.log("confirm fusion", id),
    onCancel: () => console.log("cancel fusion"),
  });
  const openWrap = document.createElement("div");
  openWrap.style.position = "relative";
  openWrap.appendChild(openPanel.el);
  stage.appendChild(openWrap);
  openPanel.open();

  const emptyPanel = createFusionPanel({
    getCandidatePairs: () => [],
    onConfirm: () => {},
  });
  const emptyWrap = document.createElement("div");
  emptyWrap.style.position = "relative";
  emptyWrap.appendChild(emptyPanel.el);
  stage.appendChild(emptyWrap);
  emptyPanel.open();
}

/* --------------------------------------------------------------------- */
/* 4. Cursor indicators                                                   */
/* --------------------------------------------------------------------- */
{
  const { stage } = section("Cursor indicators — P2 gamepad active vs no gamepad connected");
  stage.style.display = "flex";
  stage.style.gap = "16px";
  stage.style.padding = "0";
  stage.style.height = "220px";

  const activeStage = document.createElement("div");
  activeStage.style.position = "relative";
  activeStage.style.flex = "1";
  activeStage.style.background = "inherit";
  const activeCursors = createCursorIndicators();
  activeStage.appendChild(activeCursors.container);
  activeCursors.setPosition("p1", 90, 70);
  activeCursors.setPosition("p2", 240, 140);
  activeCursors.setP2Active(true);
  stage.appendChild(activeStage);

  const inactiveStage = document.createElement("div");
  inactiveStage.style.position = "relative";
  inactiveStage.style.flex = "1";
  const inactiveCursors = createCursorIndicators();
  inactiveStage.appendChild(inactiveCursors.container);
  inactiveCursors.setPosition("p1", 90, 70);
  inactiveCursors.setPosition("p2", 240, 100);
  inactiveCursors.setP2Active(false);
  stage.appendChild(inactiveStage);
}

/* --------------------------------------------------------------------- */
/* 5. End screens                                                         */
/* --------------------------------------------------------------------- */
{
  const { stage } = section("Victory / Defeat overlays");
  stage.style.display = "flex";
  stage.style.gap = "16px";
  stage.style.height = "480px";
  stage.style.padding = "0";

  const status = document.createElement("div");
  status.className = "gallery-caption";

  const victoryStage = document.createElement("div");
  victoryStage.style.position = "relative";
  victoryStage.style.flex = "1";
  const victory = createVictoryScreen({
    onRestart: () => (status.textContent = "Victory restart clicked"),
  });
  victoryStage.appendChild(victory.el);
  stage.appendChild(victoryStage);
  victory.show(12);

  const defeatStage = document.createElement("div");
  defeatStage.style.position = "relative";
  defeatStage.style.flex = "1";
  const defeat = createDefeatScreen({
    onRestart: () => (status.textContent = "Defeat restart clicked"),
  });
  defeatStage.appendChild(defeat.el);
  stage.appendChild(defeatStage);
  defeat.show(7);

  gallery.appendChild(status);
}
