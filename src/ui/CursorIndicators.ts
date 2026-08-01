// P1 / P2 cursor reticles for local co-op input (see InputManager). P1 tracks
// the real mouse, P2 tracks a virtual gamepad-driven cursor. This component
// only draws two positioned reticles — it does not read InputManager itself,
// so the orchestrator stays in control of the actual coordinate mapping
// (NDC -> screen px, whatever raycasting/hit-testing it layers on top).
//
// API:
//   createCursorIndicators() => {
//     container: HTMLElement;  // absolute-fill, pointer-events:none — mount over the canvas
//     setPosition(player: "p1" | "p2", xPx: number, yPx: number): void;
//     setP2Active(active: boolean): void;   // drive from InputManager.isP2Active()
//     setActionPressed(player: "p1" | "p2", pressed: boolean): void; // optional press-feedback pulse
//   }
//
// Suggested per-frame wiring in the orchestrator:
//   const rect = canvas.getBoundingClientRect();
//   const p1 = input.getCursor("p1");
//   cursors.setPosition("p1", rect.left + (p1.ndcX * 0.5 + 0.5) * rect.width,
//                              rect.top + (1 - (p1.ndcY * 0.5 + 0.5)) * rect.height);
//   cursors.setP2Active(input.isP2Active());
//   ...same for p2...

export type CursorPlayer = "p1" | "p2";

export interface CursorIndicators {
  container: HTMLElement;
  setPosition: (player: CursorPlayer, xPx: number, yPx: number) => void;
  setP1Active: (active: boolean) => void;
  setP2Active: (active: boolean) => void;
  setActionPressed: (player: CursorPlayer, pressed: boolean) => void;
}

export function createCursorIndicators(): CursorIndicators {
  const container = document.createElement("div");
  container.className = "rw-cursor-layer";

  const p1 = buildReticle("p1");
  const p2 = buildReticle("p2");
  container.append(p1.root, p2.root);

  // P2 starts inactive until a gamepad is detected.
  p2.root.classList.add("rw-cursor-inactive");

  const els: Record<CursorPlayer, ReturnType<typeof buildReticle>> = { p1, p2 };

  return {
    container,
    setPosition(player, xPx, yPx) {
      const el = els[player].root;
      el.style.transform = `translate(${xPx}px, ${yPx}px) translate(-50%, -50%)`;
    },
    setP1Active(active) {
      p1.root.classList.toggle("rw-cursor-inactive", !active);
    },
    setP2Active(active) {
      p2.root.classList.toggle("rw-cursor-inactive", !active);
    },
    setActionPressed(player, pressed) {
      els[player].root.classList.toggle("rw-cursor-pressed", pressed);
    },
  };
}

function buildReticle(player: CursorPlayer) {
  const root = document.createElement("div");
  root.className = `rw-cursor rw-cursor-${player}`;

  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("class", "rw-cursor-glyph");
  svg.innerHTML =
    player === "p1"
      ? `<circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/>
         <line x1="24" y1="2" x2="24" y2="12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
         <line x1="24" y1="36" x2="24" y2="46" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
         <line x1="2" y1="24" x2="12" y2="24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
         <line x1="36" y1="24" x2="46" y2="24" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
         <circle cx="24" cy="24" r="2.2" fill="currentColor"/>`
      : `<path d="M24 4 42 15v18L24 44 6 33V15z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
         <circle cx="24" cy="24" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/>
         <circle cx="24" cy="24" r="1.8" fill="currentColor"/>`;
  root.appendChild(svg);

  const tag = document.createElement("span");
  tag.className = "rw-cursor-tag";
  tag.textContent = player.toUpperCase();
  root.appendChild(tag);

  if (player === "p2") {
    const hint = document.createElement("span");
    hint.className = "rw-cursor-hint";
    hint.textContent = "Connect a gamepad";
    root.appendChild(hint);
  }

  return { root };
}
