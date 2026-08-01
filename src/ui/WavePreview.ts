// "Next wave" scouting panel: a small button that toggles a popup listing
// the upcoming wave's enemies in actual spawn order, each tagged with a
// movement-type icon (ground / flying / burrowing) so players can tell at
// a glance whether they need anti-air before the wave lands — matching how
// WaveManager.computeSpawnOrder() actually interleaves multiple spawn
// entries by timing rather than running them one after another.
//
// API:
//   createWavePreview({ getEntries }) => { el: HTMLElement }
//   getEntries() should return the upcoming wave's spawn-order entries
//   already resolved to {enemyId, name, movement, isBoss}; the component
//   only handles layout/toggling, not wave lookup.

import { createPanel } from "@/ui/panel";
import { createGlyphIcon, type MiscGlyph } from "@/ui/theme";
import type { EnemyMovementKind } from "@/game/types";

export interface PreviewEntry {
  enemyId: string;
  name: string;
  movement: EnemyMovementKind;
  isBoss?: boolean;
}

export interface WavePreviewApi {
  el: HTMLElement;
}

const MOVEMENT_GLYPH: Record<EnemyMovementKind, MiscGlyph> = {
  flying: "flying",
  ground: "ground",
  burrowing: "burrow",
};

const MOVEMENT_LABEL: Record<EnemyMovementKind, string> = {
  flying: "Air",
  ground: "Ground",
  burrowing: "Burrow",
};

/** Long endless-mode waves can queue 100+ individual spawns — render the
 * true sequence up to this many icons, then collapse the tail into a
 * "+N more" chip rather than flooding the popup. */
const MAX_VISIBLE = 48;

export function createWavePreview(opts: { getEntries: () => PreviewEntry[] }): WavePreviewApi {
  const root = document.createElement("div");
  root.className = "rw-wave-preview";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rw-wave-preview-btn";
  btn.setAttribute("aria-label", "Preview next wave");
  btn.appendChild(createGlyphIcon("scroll", 20));
  root.appendChild(btn);

  const panel = createPanel({ className: "rw-wave-preview-panel rw-wave-preview-hidden", title: "Next Wave" });
  panel.body.classList.add("rw-wave-preview-body");
  root.appendChild(panel.root);

  let open = false;
  const setOpen = (next: boolean) => {
    open = next;
    panel.root.classList.toggle("rw-wave-preview-hidden", !open);
    if (open) render();
  };

  btn.addEventListener("click", () => setOpen(!open));
  document.addEventListener("pointerdown", (e) => {
    if (open && !root.contains(e.target as Node)) setOpen(false);
  });

  function render() {
    const entries = opts.getEntries();
    panel.body.innerHTML = "";

    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "rw-wave-preview-empty";
      empty.textContent = "No more waves queued.";
      panel.body.appendChild(empty);
      return;
    }

    const counts: Record<EnemyMovementKind, number> = { ground: 0, flying: 0, burrowing: 0 };
    for (const e of entries) counts[e.movement]++;

    const tally = document.createElement("div");
    tally.className = "rw-wave-preview-tally";
    for (const kind of ["ground", "flying", "burrowing"] as EnemyMovementKind[]) {
      if (counts[kind] === 0) continue;
      const chip = document.createElement("span");
      chip.className = `rw-wave-preview-chip rw-wave-preview-chip-${kind}`;
      chip.appendChild(createGlyphIcon(MOVEMENT_GLYPH[kind], 14));
      const label = document.createElement("span");
      label.textContent = `${MOVEMENT_LABEL[kind]} ×${counts[kind]}`;
      chip.appendChild(label);
      tally.appendChild(chip);
    }
    panel.body.appendChild(tally);

    const sequence = document.createElement("div");
    sequence.className = "rw-wave-preview-sequence";
    const visible = entries.slice(0, MAX_VISIBLE);
    for (const e of visible) {
      const icon = document.createElement("span");
      icon.className = `rw-wave-preview-icon rw-wave-preview-icon-${e.movement}${e.isBoss ? " rw-wave-preview-icon-boss" : ""}`;
      icon.title = `${e.name}${e.isBoss ? " (Boss)" : ""} — ${MOVEMENT_LABEL[e.movement]}`;
      icon.appendChild(createGlyphIcon(e.isBoss ? "crown" : MOVEMENT_GLYPH[e.movement], e.isBoss ? 16 : 13));
      sequence.appendChild(icon);
    }
    if (entries.length > MAX_VISIBLE) {
      const more = document.createElement("span");
      more.className = "rw-wave-preview-more";
      more.textContent = `+${entries.length - MAX_VISIBLE} more`;
      sequence.appendChild(more);
    }
    panel.body.appendChild(sequence);
  }

  return { el: root };
}
