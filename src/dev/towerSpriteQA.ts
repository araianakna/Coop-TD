import { listAllTowers } from "@/game/towers/TowerRegistry";
import { getTowerSprite, TOWER_SPRITE_SIZE, TOWER_GROUND_FRAC } from "@/game/render2d/TowerSprites";

const towers = listAllTowers();
const SCALE = 4;
const CELL = TOWER_SPRITE_SIZE * SCALE;
const PAD = 14;
const LABEL_H = 26;

const root = document.getElementById("app")!;
root.style.background = "#2b2233";
root.style.padding = "12px";
root.style.fontFamily = "monospace";

const cols = 3;
for (const def of towers) {
  const group = document.createElement("div");
  group.style.display = "inline-block";
  group.style.verticalAlign = "top";
  group.style.margin = "6px";
  group.style.background = "#1b1522";
  group.style.padding = "6px";
  group.style.border = "1px solid #443a55";

  const title = document.createElement("div");
  title.textContent = `${def.name}  [${def.id}]  (${def.element})`;
  title.style.color = "#f0e6d2";
  title.style.fontSize = "11px";
  title.style.marginBottom = "4px";
  group.appendChild(title);

  const row = document.createElement("div");
  for (const tier of [1, 2, 3] as const) {
    const wrap = document.createElement("div");
    wrap.style.display = "inline-block";
    wrap.style.marginRight = "4px";
    wrap.style.textAlign = "center";

    const canvas = document.createElement("canvas");
    canvas.width = CELL;
    canvas.height = CELL + LABEL_H;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#39304a";
    ctx.fillRect(0, 0, CELL, CELL + LABEL_H);
    // tile-ish ground hint
    ctx.fillStyle = "#4a4060";
    ctx.fillRect(0, TOWER_GROUND_FRAC * CELL, CELL, 3);

    const sprite = getTowerSprite(def, tier);
    ctx.drawImage(sprite, 0, 0, CELL, CELL);
    ctx.fillStyle = "#c9b8ff";
    ctx.font = "11px monospace";
    ctx.fillText(`T${tier}`, 4, CELL + 16);

    wrap.appendChild(canvas);
    row.appendChild(wrap);
  }
  group.appendChild(row);
  root.appendChild(group);

  if (towers.indexOf(def) % cols === cols - 1) {
    root.appendChild(document.createElement("br"));
  }
}

void PAD;
