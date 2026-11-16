// Aplica tema (escuro/claro/sistema) e cor de destaque no <html>.
// O primeiro paint é resolvido por /js/theme-init.js (síncrono, evita "flash").

import { prefs } from "./storage.js";

const THEME_COLORS = { dark: "#05060f", light: "#f4f5fb" };
const media = window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(theme = prefs.get().theme) {
  if (theme === "system") return media.matches ? "dark" : "light";
  return theme === "light" ? "light" : "dark";
}

export function applyPrefs() {
  const { theme, accent } = prefs.get();
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.accent = accent;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[resolved]);
}

export function toggleTheme() {
  prefs.set({ theme: resolveTheme() === "dark" ? "light" : "dark" });
}

export function initTheme() {
  applyPrefs();
  window.addEventListener("hm:prefs", applyPrefs);
  media.addEventListener("change", () => {
    if (prefs.get().theme === "system") applyPrefs();
  });
}
