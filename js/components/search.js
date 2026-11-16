// Campo de pesquisa com sugestões ao digitar (combobox acessível).
//  - debounce de 300ms e mínimo de 2 caracteres => poucas requisições
//  - requisição anterior é cancelada quando o texto muda
//  - setas/Enter/Esc funcionam; leitores de tela recebem o status via aria-live
import { debounce, escapeHtml, html, raw, isAbortError, $ } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { searchMulti } from "../services/tmdb.js";
import { detailsPath, MEDIA_LABEL, MEDIA_PATH } from "../utils/format.js";
import { posterUrl, profileUrl } from "../utils/images.js";
import { LIMITS } from "../config.js";
import { buildPath } from "../router.js";

export function initSearch(headerEl, { navigate }) {
  const root = $("[data-search]", headerEl);
  const form = $(".search__form", root);
  const input = $(".search__input", root);
  const panel = $(".search__panel", root);
  const list = $(".search__list", root);
  const status = $("[data-search-status]", root);
  const toggle = $("[data-search-toggle]", root);
  const closeButton = $("[data-search-close]", root);

  let controller = null;
  let activeIndex = -1;
  let lastQuery = "";

  const options = () => Array.from(list.querySelectorAll('[role="option"]'));

  function setExpanded(expanded) {
    panel.hidden = !expanded;
    input.setAttribute("aria-expanded", String(expanded));
    if (!expanded) {
      activeIndex = -1;
      input.removeAttribute("aria-activedescendant");
    }
  }

  function setActive(index) {
    const items = options();
    items.forEach((item, i) => item.setAttribute("aria-selected", String(i === index)));
    activeIndex = index;
    if (index >= 0 && items[index]) {
      input.setAttribute("aria-activedescendant", items[index].id);
      items[index].scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }

  const searchUrl = (query) => buildPath("/busca", { q: query });

  function renderResults(query, items) {
    const rows = items.slice(0, LIMITS.suggestions).map((item, index) => {
      const isPerson = item.mediaType === "person";
      const image = isPerson ? profileUrl(item.profilePath) : posterUrl(item.posterPath, "w92");
      const href = isPerson ? `/${MEDIA_PATH.person}/${item.id}` : detailsPath(item.mediaType, item.id);
      const meta = isPerson ? item.department || "Pessoa" : [MEDIA_LABEL[item.mediaType], item.year].filter(Boolean).join(" · ");
      return html`<li class="search__option" role="option" id="search-opt-${index}" aria-selected="false" data-href="${href}">
        <span class="search__thumb">${image ? html`<img src="${image}" alt="" width="40" height="60" loading="lazy" />` : raw(icon(isPerson ? "user-round" : "film", { size: 18 }))}</span>
        <span class="search__text"><strong>${item.title}</strong><small>${meta}</small></span>
      </li>`;
    });
    rows.push(
      html`<li class="search__option search__option--all" role="option" id="search-opt-all" aria-selected="false" data-href="${searchUrl(query)}">
        ${raw(icon("search", { size: 16 }))}<span>Ver todos os resultados para “${query}”</span>
      </li>`
    );
    list.innerHTML = html`${rows}`.toString();
  }

  const runSearch = debounce(async (query) => {
    controller?.abort();
    controller = new AbortController();
    status.textContent = "Buscando…";
    list.innerHTML = `<li class="search__hint" role="presentation"><span class="spinner spinner--sm"></span> Buscando…</li>`;
    setExpanded(true);
    try {
      const { items } = await searchMulti(query, 1, { signal: controller.signal });
      if (query !== lastQuery) return;
      if (!items.length) {
        list.innerHTML = `<li class="search__hint" role="presentation">Nenhum resultado para “${escapeHtml(query)}”.</li>`;
        status.textContent = "Nenhum resultado encontrado.";
        return;
      }
      renderResults(query, items);
      status.textContent = `${Math.min(items.length, LIMITS.suggestions)} sugestões disponíveis. Use as setas para navegar.`;
    } catch (error) {
      if (isAbortError(error)) return;
      list.innerHTML = `<li class="search__hint" role="presentation">Não foi possível buscar agora. Pressione Enter para tentar na página de resultados.</li>`;
      status.textContent = "Erro ao buscar sugestões.";
    }
  }, 300);

  input.addEventListener("input", () => {
    const query = input.value.trim();
    lastQuery = query;
    if (query.length < 2) {
      runSearch.cancel();
      controller?.abort();
      list.innerHTML = "";
      setExpanded(false);
      return;
    }
    runSearch(query);
  });

  input.addEventListener("keydown", (event) => {
    const items = options();
    if (event.key === "ArrowDown" && items.length) {
      event.preventDefault();
      setExpanded(true);
      setActive((activeIndex + 1) % items.length);
    } else if (event.key === "ArrowUp" && items.length) {
      event.preventDefault();
      setActive(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
    } else if (event.key === "Escape") {
      if (!panel.hidden) setExpanded(false);
      else if (root.classList.contains("is-open")) closeMobile();
    } else if (event.key === "Enter" && activeIndex >= 0 && items[activeIndex]) {
      event.preventDefault();
      go(items[activeIndex].dataset.href);
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) {
      input.focus();
      return;
    }
    go(searchUrl(query));
  });

  list.addEventListener("click", (event) => {
    const option = event.target.closest("[data-href]");
    if (option) go(option.dataset.href);
  });
  // mousedown no painel não pode tirar o foco do input antes do clique
  panel.addEventListener("mousedown", (event) => event.preventDefault());

  function go(href) {
    runSearch.cancel();
    controller?.abort();
    setExpanded(false);
    if (!href.startsWith("/busca")) input.value = "";
    closeMobile();
    input.blur();
    navigate(href);
  }

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) setExpanded(false);
  });
  input.addEventListener("focus", () => {
    if (list.children.length && input.value.trim().length >= 2) setExpanded(true);
  });

  // --- mobile: campo recolhido vira tela cheia sobre o header ---
  function openMobile() {
    root.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    input.focus();
  }
  function closeMobile() {
    root.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", openMobile);
  closeButton.addEventListener("click", () => {
    setExpanded(false);
    closeMobile();
    toggle.focus();
  });

  // Mantém o campo sincronizado com a URL da página de busca.
  window.addEventListener("hm:route", (event) => {
    const { route, query } = event.detail;
    if (route === "search") input.value = query.get("q") || "";
    else if (document.activeElement !== input) input.value = "";
    setExpanded(false);
  });
}
