// Ponto de entrada: tema, header, router e botões globais de favorito.
import { initTheme } from "./services/theme.js";
import { mountHeader } from "./components/header.js";
import { initFavoriteButtons } from "./components/card.js";
import { startRouter } from "./router.js";

initTheme();
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());
mountHeader(document.getElementById("site-header"), document.getElementById("bottom-nav"));
initFavoriteButtons();
startRouter(document.getElementById("main"));

// Erros inesperados de Promise não devem passar em branco
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason?.name === "AbortError") event.preventDefault(); // cancelamentos são esperados
});
