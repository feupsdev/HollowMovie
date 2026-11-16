// Header (logo, navegação, busca, tema, favoritos, perfil) + barra inferior no mobile.
import { html, raw, delegate, $ } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { favorites, prefs } from "../services/storage.js";
import { resolveTheme, toggleTheme } from "../services/theme.js";
import { initSearch } from "./search.js";
import { navigate } from "../router.js";

const NAV = [
  { href: "/", label: "Início", icon: "house", match: (r) => r === "home" },
  { href: "/filmes", label: "Filmes", icon: "film", match: (r) => r === "movies" || r === "movie" },
  { href: "/series", label: "Séries", icon: "tv", match: (r) => r === "series" || r === "tv" },
  { href: "/favoritos", label: "Favoritos", icon: "heart", match: (r) => r === "favorites" },
  { href: "/perfil", label: "Perfil", icon: "user", match: (r) => r === "profile" },
];

const logo = html`<a class="brand" href="/" aria-label="HollowMovie — página inicial">
  <img src="/assets/img/logo-mark.svg" width="34" height="34" alt="" />
  <span class="brand__name">Hollow<span>Movie</span></span>
</a>`;

export function mountHeader(headerEl, bottomNavEl) {
  headerEl.innerHTML = html`<div class="site-header__inner container">
    ${logo}
    <nav class="main-nav" aria-label="Navegação principal">
      ${NAV.slice(0, 3).map((item) => html`<a class="main-nav__link" href="${item.href}" data-nav="${item.href}">${item.label}</a>`)}
    </nav>
    <div class="site-header__tools">
      <div class="search" data-search>
        <button type="button" class="icon-btn search__toggle" data-search-toggle aria-label="Abrir pesquisa" aria-expanded="false">
          ${raw(icon("search", { size: 20 }))}
        </button>
        <form class="search__form" role="search" action="/busca" method="get" autocomplete="off">
          <label class="sr-only" for="search-input">Pesquisar filmes, séries e pessoas</label>
          ${raw(icon("search", { size: 18, className: "search__icon" }))}
          <input id="search-input" class="search__input" type="search" name="q" placeholder="Pesquisar filmes, séries, pessoas…" role="combobox" aria-expanded="false" aria-controls="search-listbox" aria-autocomplete="list" enterkeyhint="search" maxlength="100" />
          <button type="button" class="search__close icon-btn" data-search-close aria-label="Fechar pesquisa">${raw(icon("x", { size: 18 }))}</button>
          <div class="search__panel" id="search-panel" hidden>
            <div class="sr-only" role="status" aria-live="polite" data-search-status></div>
            <ul class="search__list" id="search-listbox" role="listbox" aria-label="Sugestões"></ul>
          </div>
        </form>
      </div>
      <button type="button" class="icon-btn" data-theme-toggle></button>
      <a class="icon-btn header-fav" href="/favoritos" data-nav="/favoritos" aria-label="Favoritos">
        ${raw(icon("heart", { size: 20 }))}<span class="badge" data-fav-count hidden></span>
      </a>
      <a class="avatar-btn" href="/perfil" data-nav="/perfil" aria-label="Perfil e preferências"><span data-avatar-letter>${raw(icon("user", { size: 18 }))}</span></a>
    </div>
  </div>`.toString();

  bottomNavEl.innerHTML = html`<ul class="bottom-nav__list">
    ${NAV.map(
      (item) => html`<li><a class="bottom-nav__link" href="${item.href}" data-nav="${item.href}">${raw(icon(item.icon, { size: 22 }))}<span>${item.label}</span></a></li>`
    )}
  </ul>`.toString();

  // --- estado: tema, contagem de favoritos, avatar ---
  const themeButton = $("[data-theme-toggle]", headerEl);
  const favCount = $("[data-fav-count]", headerEl);
  const avatarLetter = $("[data-avatar-letter]", headerEl);

  function syncTheme() {
    const dark = resolveTheme() === "dark";
    themeButton.innerHTML = icon(dark ? "sun" : "moon", { size: 20 });
    themeButton.setAttribute("aria-label", dark ? "Mudar para o tema claro" : "Mudar para o tema escuro");
    themeButton.title = dark ? "Tema claro" : "Tema escuro";
  }
  function syncFavorites() {
    const count = favorites.count();
    favCount.textContent = count > 99 ? "99+" : String(count);
    favCount.hidden = count === 0;
    $(".header-fav", headerEl).setAttribute("aria-label", count ? `Favoritos (${count})` : "Favoritos");
  }
  function syncAvatar() {
    const name = prefs.get().name.trim();
    avatarLetter.innerHTML = name ? "" : icon("user", { size: 18 });
    if (name) avatarLetter.textContent = name.charAt(0).toUpperCase();
  }

  themeButton.addEventListener("click", toggleTheme);
  window.addEventListener("hm:prefs", () => {
    syncTheme();
    syncAvatar();
  });
  window.addEventListener("hm:favorites", syncFavorites);
  syncTheme();
  syncFavorites();
  syncAvatar();

  // --- item ativo de navegação ---
  function syncActive(routeName) {
    document.querySelectorAll("[data-nav]").forEach((link) => {
      const item = NAV.find((n) => n.href === link.dataset.nav);
      const active = item ? item.match(routeName) : false;
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
  window.addEventListener("hm:route", (event) => syncActive(event.detail.route));

  // --- header translúcido -> sólido ao rolar ---
  const onScroll = () => headerEl.classList.toggle("is-scrolled", window.scrollY > 24);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  initSearch(headerEl, { navigate });
  delegate(bottomNavEl, "click", "a", () => {}); // reservado: o router já intercepta os links
}
