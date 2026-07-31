import "@/style.css";
import "@/ui/ui.css";
import { Game, type MapChoice } from "@/game/Game";
import { createStartScreen } from "@/ui/StartScreen";

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

const startScreen = createStartScreen({
  maps: [
    {
      id: "map01",
      name: "The Ashfall Vale",
      description: "A winding forest road with six broad turns. A forgiving proving ground for new defenses.",
    },
    {
      id: "map02",
      name: "The Serpent's Coil",
      description: "A tight twelve-turn switchback broken by rocky outcrops. Far less room to spread your towers.",
    },
  ],
  onSelect: (mapId) => {
    startScreen.hide();
    new Game(host, mapId as MapChoice);
  },
});

host.appendChild(startScreen.el);
startScreen.show();
