// Pre-game map-select overlay.
//
// API:
//   createStartScreen({ maps, onSelect }) => StartScreen
//
//   interface MapOption { id: string; name: string; description: string; }
//   interface StartScreenOptions {
//     maps: MapOption[];
//     onSelect: (mapId: string) => void;   // fired once, when a card (or its
//                                           // CTA button) is activated
//   }
//   interface StartScreen {
//     el: HTMLElement;      // mount once, absolute-fill; starts hidden
//     show(): void;         // reveals with entrance animation
//     hide(): void;
//   }
//
// Follows the same "el starts hidden, mount once, orchestrator toggles via
// show()/hide()" convention as EndScreens.ts. `onSelect` is the only piece
// of game wiring the orchestrator needs to hook up — call `hide()` from
// inside (or after) the handler once the chosen map's Game instance is
// spun up.
//
// There's no image-asset pipeline for map thumbnails, so cards are
// differentiated purely with CSS: each gets a distinct accent color and a
// small procedural rune-sigil glyph, cycling deterministically by list
// position so the component stays generic regardless of which/how many
// maps are passed in.

import { createPanel } from "@/ui/panel";

export interface MapOption {
  id: string;
  name: string;
  description: string;
}

export interface StartScreenOptions {
  maps: MapOption[];
  onSelect: (mapId: string) => void;
}

export interface StartScreen {
  el: HTMLElement;
  show: () => void;
  hide: () => void;
}

/** Decorative accent colors cycled per card, independent of map identity. */
const CARD_ACCENTS = ["#ffd27a", "#58e6e0", "#c58cff", "#7be08a", "#ff8686"];

/** Small geometric rune-sigil glyphs (viewBox 0 0 24 24), cycled per card. */
const CARD_SIGILS = [
  // radiating sun/portal — echoes the spawn/base glyph motif from the terrain shader
  `<circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6"/>
   <path d="M12 1.6v4M12 18.4v4M1.6 12h4M18.4 12h4M4.8 4.8l2.8 2.8M16.4 16.4l2.8 2.8M19.2 4.8l-2.8 2.8M7.6 16.4l-2.8 2.8"
     stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  // jagged peaks — echoes the "blocked" rocky-outcrop motif
  `<path d="M2 18.5 7.2 8l3.6 5.4L14 7l3 6.4 5-8v13.1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
   <path d="M2 18.5h20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  // switchback path — echoes a winding route
  `<path d="M3 19c3 0 3-5 6-5s3 5 6 5 3-5 6-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
   <circle cx="3" cy="19" r="1.4"/><circle cx="21" cy="9" r="1.4"/>`,
];

export function createStartScreen(opts: StartScreenOptions): StartScreen {
  const el = document.createElement("div");
  el.className = "rw-startscreen rw-startscreen-hidden";

  const backdrop = document.createElement("div");
  backdrop.className = "rw-startscreen-backdrop";

  const panel = createPanel({ className: "rw-startscreen-panel", title: "Choose Your Battleground" });

  const content = document.createElement("div");
  content.className = "rw-startscreen-content";

  const subtitle = document.createElement("p");
  subtitle.className = "rw-startscreen-subtitle";
  subtitle.textContent = "Two realms await your defense. Choose where to make your stand.";
  content.appendChild(subtitle);

  const grid = document.createElement("div");
  grid.className = "rw-map-grid";
  content.appendChild(grid);

  const select = (mapId: string) => opts.onSelect(mapId);

  opts.maps.forEach((map, i) => {
    const accent = CARD_ACCENTS[i % CARD_ACCENTS.length];
    const sigil = CARD_SIGILS[i % CARD_SIGILS.length];

    const card = document.createElement("button");
    card.type = "button";
    card.className = "rw-map-card";
    card.style.setProperty("--rw-map-accent", accent);
    card.dataset.mapId = map.id;

    const icon = document.createElement("span");
    icon.className = "rw-map-card-icon";
    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.innerHTML = sigil;
    icon.appendChild(svg);

    const name = document.createElement("h3");
    name.className = "rw-map-card-name";
    name.textContent = map.name;

    const desc = document.createElement("p");
    desc.className = "rw-map-card-desc";
    desc.textContent = map.description;

    const cta = document.createElement("span");
    cta.className = "rw-map-card-cta";
    cta.textContent = "Begin Defense";

    card.append(icon, name, desc, cta);
    card.addEventListener("click", () => select(map.id));

    grid.appendChild(card);
  });

  panel.body.appendChild(content);
  el.append(backdrop, panel.root);

  return {
    el,
    show() {
      el.classList.remove("rw-startscreen-hidden");
      content.classList.remove("rw-startscreen-anim");
      void content.offsetWidth;
      content.classList.add("rw-startscreen-anim");
    },
    hide() {
      el.classList.add("rw-startscreen-hidden");
    },
  };
}
