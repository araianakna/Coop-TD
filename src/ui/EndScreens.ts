// Full-screen victory / defeat overlays with a restart affordance.
//
// API:
//   createVictoryScreen({ onRestart, waveReached?, message? }) => EndScreen
//   createDefeatScreen({ onRestart, waveReached?, message? })  => EndScreen
//
//   interface EndScreen {
//     el: HTMLElement;               // mount once, absolute-fill; starts hidden
//     show(waveReached?: number): void;  // reveals with entrance animation;
//                                         // optionally override the wave count shown
//     hide(): void;
//   }
//
// `onRestart` fires when the player clicks the restart button (or presses the
// bound confirm action, if the orchestrator forwards it — see note below).
// The component does not reset any game state itself.
//
// Note on co-op confirm: since both P1 (mouse) and P2 (gamepad) should be
// able to restart, the restart button is a real focusable <button>; the
// orchestrator can also call `el.querySelector('.rw-endscreen-restart')` (or
// just invoke `onRestart` directly) when it detects a P2 confirm press while
// an end screen is showing.

import { createGlyphIcon } from "@/ui/theme";

export interface EndScreenOptions {
  onRestart: () => void;
  waveReached?: number;
  message?: string;
}

export interface EndScreen {
  el: HTMLElement;
  show: (waveReached?: number) => void;
  hide: () => void;
}

export function createVictoryScreen(opts: EndScreenOptions): EndScreen {
  return buildEndScreen("victory", {
    icon: "crown",
    title: "Victory!",
    defaultMessage: (wave) =>
      wave != null ? `The realm holds. All ${wave} waves repelled.` : "The realm holds. Every wave repelled.",
    buttonLabel: "Play Again",
    ...opts,
  });
}

export function createDefeatScreen(opts: EndScreenOptions): EndScreen {
  return buildEndScreen("defeat", {
    icon: "skull",
    title: "Defeat",
    defaultMessage: (wave) =>
      wave != null ? `Your base has fallen at wave ${wave}.` : "Your base has fallen.",
    buttonLabel: "Try Again",
    ...opts,
  });
}

interface BuildConfig extends EndScreenOptions {
  icon: "crown" | "skull";
  title: string;
  defaultMessage: (wave?: number) => string;
  buttonLabel: string;
}

function buildEndScreen(kind: "victory" | "defeat", cfg: BuildConfig): EndScreen {
  const el = document.createElement("div");
  el.className = `rw-endscreen rw-endscreen-${kind} rw-endscreen-hidden`;

  const backdrop = document.createElement("div");
  backdrop.className = "rw-endscreen-backdrop";

  const content = document.createElement("div");
  content.className = "rw-endscreen-content";

  const iconWrap = document.createElement("div");
  iconWrap.className = "rw-endscreen-icon";
  iconWrap.appendChild(createGlyphIcon(cfg.icon, 56));

  const title = document.createElement("h1");
  title.className = "rw-endscreen-title";
  title.textContent = cfg.title;

  const subtitle = document.createElement("p");
  subtitle.className = "rw-endscreen-subtitle";
  subtitle.textContent = cfg.message ?? cfg.defaultMessage(cfg.waveReached);

  const restartBtn = document.createElement("button");
  restartBtn.type = "button";
  restartBtn.className = "rw-btn rw-btn-gold rw-endscreen-restart";
  restartBtn.textContent = cfg.buttonLabel;
  restartBtn.addEventListener("click", () => cfg.onRestart());

  content.append(iconWrap, title, subtitle, restartBtn);
  el.append(backdrop, content);

  return {
    el,
    show(waveReached) {
      if (waveReached != null || cfg.message == null) {
        subtitle.textContent = cfg.message ?? cfg.defaultMessage(waveReached ?? cfg.waveReached);
      }
      el.classList.remove("rw-endscreen-hidden");
      // restart the entrance animation on repeat shows
      content.classList.remove("rw-endscreen-anim");
      void content.offsetWidth;
      content.classList.add("rw-endscreen-anim");
    },
    hide() {
      el.classList.add("rw-endscreen-hidden");
    },
  };
}
