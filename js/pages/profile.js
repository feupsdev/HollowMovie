// Perfil: estatísticas, preferências, histórico e gerenciamento dos dados locais.
import { html, raw, $, debounce } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { setMeta } from "../utils/seo.js";
import { clearAllData, exportData, favorites, history, prefs } from "../services/storage.js";
import { initScroller, railMarkup, renderCards } from "../components/carousel.js";
import { mediaCard } from "../components/card.js";
import { emptyState } from "../components/states.js";
import { confirmDialog } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { formatNumber, relativeTime } from "../utils/format.js";

const THEMES = [
  { value: "dark", label: "Escuro", icon: "moon" },
  { value: "light", label: "Claro", icon: "sun" },
  { value: "system", label: "Sistema", icon: "monitor" },
];
const ACCENTS = [
  { value: "violet", label: "Violeta" },
  { value: "blue", label: "Azul" },
  { value: "orchid", label: "Orquídea" },
];

export async function mount(outlet) {
  setMeta({ title: "Perfil e preferências", description: "Seu perfil, histórico e preferências no HollowMovie.", noindex: true });
  const cleanups = [];

  outlet.innerHTML = html`<div class="container page profile">
    <header class="profile__head">
      <div class="profile__avatar" data-avatar aria-hidden="true"></div>
      <div>
        <h1 class="page__title" data-greeting>Seu perfil</h1>
        <p class="page__lead">Tudo fica salvo apenas neste navegador, sem cadastro.</p>
      </div>
    </header>

    <section class="stats" aria-label="Resumo" data-stats></section>

    <div class="profile__grid">
      <section class="panel" aria-labelledby="prefs-h">
        <h2 class="panel__title" id="prefs-h">Preferências</h2>

        <div class="field">
          <label class="field__label" for="pref-name">Seu nome</label>
          <input class="input" id="pref-name" type="text" maxlength="30" placeholder="Como devemos te chamar?" autocomplete="nickname" />
        </div>

        <fieldset class="fieldset">
          <legend class="field__label">Tema</legend>
          <div class="segmented segmented--wide" data-themes></div>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="field__label">Cor de destaque</legend>
          <div class="swatches" data-accents></div>
        </fieldset>

        <div class="switch-row">
          <div>
            <label class="field__label" for="pref-autoplay">Rotação automática do destaque</label>
            <p class="muted">Troca o banner da página inicial a cada poucos segundos.</p>
          </div>
          <input class="switch" id="pref-autoplay" type="checkbox" role="switch" />
        </div>
      </section>

      <section class="panel" aria-labelledby="data-h">
        <h2 class="panel__title" id="data-h">Seus dados</h2>
        <p class="muted">Favoritos, histórico e preferências são armazenados no <code>localStorage</code> deste navegador.</p>
        <div class="panel__actions">
          <button type="button" class="btn btn--ghost" data-export>${raw(icon("download", { size: 16 }))} Exportar (JSON)</button>
          <button type="button" class="btn btn--ghost btn--danger-ghost" data-wipe>${raw(icon("trash-2", { size: 16 }))} Apagar tudo</button>
        </div>
      </section>
    </div>

    <div data-favorites></div>

    <section class="block" aria-labelledby="history-h">
      <div class="block__head">
        <h2 class="block__title" id="history-h">Histórico</h2>
        <button type="button" class="btn btn--ghost btn--sm btn--danger-ghost" data-clear-history>${raw(icon("trash-2", { size: 16 }))} Limpar histórico</button>
      </div>
      <div data-history></div>
    </section>
  </div>`.toString();

  const stats = $("[data-stats]", outlet);
  const nameInput = $("#pref-name", outlet);
  const autoplay = $("#pref-autoplay", outlet);
  const themesEl = $("[data-themes]", outlet);
  const accentsEl = $("[data-accents]", outlet);
  const favSlot = $("[data-favorites]", outlet);
  const historySlot = $("[data-history]", outlet);
  const clearHistoryBtn = $("[data-clear-history]", outlet);

  // ----- blocos -----
  function renderIdentity() {
    const { name } = prefs.get();
    const avatar = $("[data-avatar]", outlet);
    if (name) avatar.textContent = name.charAt(0).toUpperCase();
    else avatar.innerHTML = icon("user", { size: 32 });
    $("[data-greeting]", outlet).textContent = name ? `Olá, ${name}` : "Seu perfil";
  }

  function renderStats() {
    const favs = favorites.list();
    const movies = favs.filter((f) => f.mediaType === "movie").length;
    const items = [
      ["Favoritos", favs.length],
      ["Filmes favoritos", movies],
      ["Séries favoritas", favs.length - movies],
      ["Títulos vistos", history.list().length],
    ];
    stats.innerHTML = items.map(([label, value]) => html`<div class="stat"><strong>${formatNumber(value)}</strong><span>${label}</span></div>`).join("");
  }

  function renderPrefs() {
    const current = prefs.get();
    themesEl.innerHTML = THEMES.map(
      (t) => html`<button type="button" class="segmented__btn" data-theme="${t.value}" aria-pressed="${current.theme === t.value}">${raw(icon(t.icon, { size: 16 }))} ${t.label}</button>`
    ).join("");
    accentsEl.innerHTML = ACCENTS.map(
      (a) => html`<button type="button" class="swatch swatch--${a.value}" data-accent="${a.value}" aria-pressed="${current.accent === a.value}" aria-label="${a.label}" title="${a.label}"></button>`
    ).join("");
    autoplay.checked = current.heroAutoplay;
  }

  function renderFavorites() {
    const list = favorites.list();
    favSlot.innerHTML = list.length
      ? railMarkup({ title: "Meus favoritos", href: "/favoritos", hrefLabel: "Ver todos", itemsMarkup: renderCards(list.slice(0, 15), { showType: true }) }).toString()
      : "";
    favSlot.querySelectorAll(".rail").forEach((rail) => cleanups.push(initScroller(rail)));
  }

  function renderHistory() {
    const list = history.list();
    clearHistoryBtn.hidden = !list.length;
    historySlot.innerHTML = list.length
      ? html`<div class="grid grid--compact">${list.map((entry) => html`<div class="history-item">${mediaCard(entry, { showType: true })}<p class="history-item__time">${relativeTime(entry.viewedAt)}</p></div>`)}</div>`.toString()
      : emptyState({ iconName: "history", title: "Nenhum título visto ainda", text: "Os filmes e séries que você abrir aparecem aqui.", action: { href: "/", label: "Explorar" } }).toString();
  }

  // ----- eventos -----
  const saveName = debounce(() => prefs.set({ name: nameInput.value.trim() }), 300);
  nameInput.value = prefs.get().name;
  nameInput.addEventListener("input", saveName);

  autoplay.addEventListener("change", () => prefs.set({ heroAutoplay: autoplay.checked }));
  themesEl.addEventListener("click", (e) => {
    const button = e.target.closest("[data-theme]");
    if (button) prefs.set({ theme: button.dataset.theme });
  });
  accentsEl.addEventListener("click", (e) => {
    const button = e.target.closest("[data-accent]");
    if (button) prefs.set({ accent: button.dataset.accent });
  });

  $("[data-export]", outlet).addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hollowmovie-dados-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Arquivo exportado.");
  });

  clearHistoryBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Limpar o histórico?", text: "A lista de títulos visualizados será apagada.", confirmLabel: "Limpar histórico", danger: true });
    if (!ok) return;
    history.clear();
    toast("Histórico limpo.");
  });

  $("[data-wipe]", outlet).addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Apagar todos os dados?",
      text: "Favoritos, histórico e preferências deste navegador serão removidos. Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar tudo",
      danger: true,
    });
    if (!ok) return;
    clearAllData();
    nameInput.value = "";
    toast("Todos os dados foram apagados.");
  });

  const onPrefs = () => {
    renderPrefs();
    renderIdentity();
  };
  const onFavs = () => {
    renderStats();
    renderFavorites();
  };
  const onHistory = () => {
    renderStats();
    renderHistory();
  };
  window.addEventListener("hm:prefs", onPrefs);
  window.addEventListener("hm:favorites", onFavs);
  window.addEventListener("hm:history", onHistory);

  renderIdentity();
  renderStats();
  renderPrefs();
  renderFavorites();
  renderHistory();

  return {
    destroy() {
      window.removeEventListener("hm:prefs", onPrefs);
      window.removeEventListener("hm:favorites", onFavs);
      window.removeEventListener("hm:history", onHistory);
      cleanups.forEach((fn) => fn());
      saveName.cancel();
    },
  };
}
