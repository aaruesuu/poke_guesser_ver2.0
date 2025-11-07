import { initDOM } from "./dom.js";
import { Handlers, initGame } from "./game.js";

document.addEventListener("DOMContentLoaded", () => {
  initDOM(Handlers);
  initGame();
});
