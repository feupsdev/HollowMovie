// Script síncrono e minúsculo: define o tema ANTES da primeira pintura (sem flash).
// Precisa ser um arquivo externo por causa da Content-Security-Policy (sem scripts inline).
(function () {
  var theme = "dark";
  var accent = "violet";
  try {
    var stored = JSON.parse(localStorage.getItem("hm:prefs:v1") || "{}");
    if (stored.theme) theme = stored.theme;
    if (stored.accent) accent = stored.accent;
  } catch (e) {}
  if (theme === "system") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  var root = document.documentElement;
  root.dataset.theme = theme === "light" ? "light" : "dark";
  root.dataset.accent = accent;
  root.style.colorScheme = root.dataset.theme;
})();
