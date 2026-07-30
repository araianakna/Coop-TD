import "@/style.css";
import { Game } from "@/game/Game";

const host = document.getElementById("app");
if (!host) throw new Error("missing #app host element");

new Game(host);
