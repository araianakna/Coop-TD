// Fusion panel: preview and confirm fusing two selected placed towers into a
// combined-element tower. Tower *selection* (clicking two towers in the 3D
// scene) lives in Game.ts — this component is a dumb preview/confirm surface
// driven entirely by candidate-pair data handed to it.
//
// API:
//   createFusionPanel({ getCandidatePairs, onConfirm, onCancel? }) => {
//     el: HTMLElement;
//     open(): void;    // call when the player has 2+ towers selected and the
//                       // fusion UI should appear; re-pulls candidates via
//                       // getCandidatePairs() and renders them
//     close(): void;    // hide the panel without confirming
//     refresh(): void;  // re-pull candidates while already open (e.g. gold changed)
//     destroy(): void;
//   }
//
// FusionCandidatePair shape (see below): the orchestrator computes, for the
// currently-selected towers, which fusion recipe(s) they could produce (there
// may be more than one if selection is ambiguous / multiple towers share a
// slot) and passes them in. `getCandidatePairs` is called fresh on every
// open()/refresh() so it can reflect live selection + gold state.
//
// onConfirm(pairId) fires when the player commits to a specific pair (after
// clicking a candidate + the Confirm button). The orchestrator is responsible
// for actually mutating game state (spending gold, removing the two source
// towers, spawning the fused tower) and then calling close() if it wants.

import type { Element, FusionElementPair } from "@/game/types";
import { createElementIcon } from "@/ui/theme";
import { createPanel } from "@/ui/panel";

export interface FusionCandidateTowerRef {
  id: string;
  name: string;
  element: Element;
}

export interface FusionCandidatePair {
  /** Unique id for this candidate pairing, passed back via onConfirm. */
  id: string;
  towerA: FusionCandidateTowerRef;
  towerB: FusionCandidateTowerRef;
  resultName: string;
  resultElementPair: FusionElementPair;
  flavorText: string;
  /** Optional gold cost to perform the fusion, if fusions aren't free. */
  cost?: number;
  /** Set false (e.g. insufficient gold) to show the pair but disable confirm. */
  affordable?: boolean;
}

export interface CreateFusionPanelOptions {
  getCandidatePairs: () => FusionCandidatePair[];
  onConfirm: (pairId: string) => void;
  onCancel?: () => void;
}

export interface FusionPanelApi {
  el: HTMLElement;
  open: () => void;
  close: () => void;
  refresh: () => void;
  destroy: () => void;
}

export function createFusionPanel(opts: CreateFusionPanelOptions): FusionPanelApi {
  const panel = createPanel({ className: "rw-fusion", title: "Fuse Towers" });
  panel.root.classList.add("rw-fusion-panel", "rw-fusion-hidden");

  // This panel only ever opens once exactly 2 towers are selected (the
  // orchestrator calls open() from that state alone), so an empty
  // candidate list always means "these two specific towers don't have a
  // recipe together" — never "you haven't picked 2 yet". The copy has to
  // say that, or players read it as a made-up range requirement (there is
  // no distance check on fusing) and try uselessly moving towers closer.
  const empty = document.createElement("p");
  empty.className = "rw-fusion-empty";
  empty.textContent =
    "These two towers can't be fused. Pair two different base towers, or a Fusion tower with a base tower of a third element it doesn't already have.";

  const list = document.createElement("div");
  list.className = "rw-fusion-list";

  const footer = document.createElement("div");
  footer.className = "rw-fusion-footer";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "rw-btn rw-btn-ghost";
  cancelBtn.textContent = "Cancel";
  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "rw-btn rw-btn-gold";
  confirmBtn.textContent = "Confirm Fusion";
  confirmBtn.disabled = true;
  footer.append(cancelBtn, confirmBtn);

  panel.body.append(empty, list, footer);

  let selectedPairId: string | null = null;
  let currentPairs: FusionCandidatePair[] = [];

  function render() {
    list.innerHTML = "";
    currentPairs = opts.getCandidatePairs();
    empty.style.display = currentPairs.length === 0 ? "block" : "none";
    list.style.display = currentPairs.length === 0 ? "none" : "flex";

    if (!currentPairs.some((p) => p.id === selectedPairId)) {
      selectedPairId = currentPairs[0]?.id ?? null;
    }

    for (const pair of currentPairs) {
      list.appendChild(buildPairCard(pair));
    }
    updateConfirmState();
  }

  function updateConfirmState() {
    const pair = currentPairs.find((p) => p.id === selectedPairId);
    confirmBtn.disabled = !pair || pair.affordable === false;
  }

  function buildPairCard(pair: FusionCandidatePair): HTMLElement {
    const card = document.createElement("div");
    card.className = "rw-fusion-card";
    card.classList.toggle("rw-fusion-card-selected", pair.id === selectedPairId);
    if (pair.affordable === false) card.classList.add("rw-fusion-card-locked");
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const inputs = document.createElement("div");
    inputs.className = "rw-fusion-inputs";

    const towerAEl = buildTowerChip(pair.towerA);
    const plus = document.createElement("span");
    plus.className = "rw-fusion-plus";
    plus.textContent = "+";
    const towerBEl = buildTowerChip(pair.towerB);

    inputs.append(towerAEl, plus, towerBEl);

    const arrow = document.createElement("div");
    arrow.className = "rw-fusion-arrow";
    arrow.innerHTML = "&#x2193;";

    const result = document.createElement("div");
    result.className = "rw-fusion-result";
    const [elA, elB] = pair.resultElementPair.split("+") as [Element, Element];
    const resultIcons = document.createElement("div");
    resultIcons.className = "rw-fusion-result-icons";
    resultIcons.appendChild(createElementIcon(elA, 34));
    resultIcons.appendChild(createElementIcon(elB, 34));
    const resultText = document.createElement("div");
    resultText.className = "rw-fusion-result-text";
    const resultName = document.createElement("span");
    resultName.className = "rw-fusion-result-name";
    resultName.textContent = pair.resultName;
    const resultFlavor = document.createElement("span");
    resultFlavor.className = "rw-fusion-result-flavor";
    resultFlavor.textContent = pair.flavorText;
    resultText.append(resultName, resultFlavor);
    result.append(resultIcons, resultText);

    if (pair.cost != null) {
      const costTag = document.createElement("span");
      costTag.className = "rw-fusion-cost";
      costTag.textContent = `${pair.cost}g`;
      result.appendChild(costTag);
    }

    card.append(inputs, arrow, result);

    const select = () => {
      selectedPairId = pair.id;
      for (const child of Array.from(list.children)) {
        child.classList.remove("rw-fusion-card-selected");
      }
      card.classList.add("rw-fusion-card-selected");
      updateConfirmState();
    };
    card.addEventListener("click", select);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") select();
    });

    return card;
  }

  function buildTowerChip(ref: FusionCandidateTowerRef): HTMLElement {
    const chip = document.createElement("div");
    chip.className = "rw-fusion-chip";
    chip.appendChild(createElementIcon(ref.element, 30));
    const label = document.createElement("span");
    label.textContent = ref.name;
    chip.appendChild(label);
    return chip;
  }

  confirmBtn.addEventListener("click", () => {
    if (selectedPairId) opts.onConfirm(selectedPairId);
  });
  cancelBtn.addEventListener("click", () => {
    opts.onCancel?.();
    close();
  });

  function open() {
    panel.root.classList.remove("rw-fusion-hidden");
    render();
  }
  function close() {
    panel.root.classList.add("rw-fusion-hidden");
  }

  return {
    el: panel.root,
    open,
    close,
    refresh: render,
    destroy: () => {
      /* no external subscriptions to release */
    },
  };
}
