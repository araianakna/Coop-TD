// Standalone master-volume mute toggle. Remembers the volume it muted from
// so unmuting restores exactly where the player left it, rather than
// snapping to some fixed "on" level.
//
// API:
//   createMuteButton({ audio }) => { el: HTMLElement }

import type { AudioSystem } from "@/audio";
import { createGlyphIcon } from "@/ui/theme";

export interface MuteButtonApi {
  el: HTMLElement;
}

export function createMuteButton(opts: { audio: AudioSystem }): MuteButtonApi {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rw-mute-btn";

  let muted = false;
  let savedVolume = opts.audio.getVolume("master");

  const iconOn = createGlyphIcon("speakerOn", 20);
  const iconOff = createGlyphIcon("speakerOff", 20);
  iconOff.style.display = "none";
  btn.append(iconOn, iconOff);

  const applyIcon = () => {
    iconOn.style.display = muted ? "none" : "";
    iconOff.style.display = muted ? "" : "none";
    btn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    btn.classList.toggle("rw-mute-btn-muted", muted);
  };
  applyIcon();

  btn.addEventListener("click", () => {
    muted = !muted;
    if (muted) {
      savedVolume = opts.audio.getVolume("master");
      opts.audio.setMasterVolume(0);
    } else {
      opts.audio.setMasterVolume(savedVolume > 0.01 ? savedVolume : 0.55);
    }
    applyIcon();
    if (!muted) opts.audio.ui.click();
  });

  return { el: btn };
}
