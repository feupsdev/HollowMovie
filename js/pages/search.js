// Busca: /search/multi + filtros combináveis + paginação.
//
// A TMDB não filtra /search/multi por gênero/ano/nota, então agregamos até
// LIMITS.searchPages páginas (≈100 resultados mais relevantes), filtramos e
// ordenamos no cliente e paginamos localmente. As listas de gênero/ano/idioma
// só oferecem valores que existem nos resultados (sem opções "mortas").
import { html, raw, $, isAbortError } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { setMeta } from "../utils/seo.js";
import { buildPath } from "../router.js";
import { getGenreMap, getTrending, searchMulti } from "../services/tmdb.js";
import { cardSkeletons, mediaCard, personCard } from "../components/card.js";
import { emptyState, errorState } from "../components/states.js";
import { pagination } from "../components/pagination.js";
import { RATING_OPTIONS, selectField } from "../components/forms.js";
import { formatNumber, languageName } from "../utils/format.js";
import { LIMITS } from "../config.js";

const TYPES = [
  { value: "all", label: "Tudo" },
  { value: "movie", label: "Filmes" },
  { value: "tv", label: "Séries" },
  { value: "person", label: "Pessoas" },
];
const SORTS = [
  { value: "relevance", label: "Relevância" },
  { value: "popularity", label: "Popularidade" },
  { value: "rating", label: "Melhor avaliação" },
  { value: "date", label: "Lançamento mais recente" },
];

function readState(query) {
  const page = Number(query.get("page"));
  return {
    q: (query.get("q") || "").trim().slice(0, 100),
    type: TYPES.some((t) => t.value === query.get("type")) ? query.get("type") : "all",
    genre: /^\d+$/.test(query.get("genre") || "") ? query.get("genre") : "",
    year: /^\d{4}$/.test(query.get("year") || "") ? query.get("year") : "",
    rating: ["5", "6", "7", "8", "9"].includes(query.get("rating")) ? query.get("rating") : "",
    lang: /^[a-z]{2,3}$/.test(query.get("lang") || "") ? query.get("lang") : "",
    sort: SORTS.some((s) => s.value === query.get("sort")) ? query.get("sort") : "relevance",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

const toParams = (s) => ({
  q: s.q,
  type: s.type === "all" ? "" : s.type,
  genre: s.genre,
  year: s.year,
  rating: s.rating,
  lang: s.lang,
  sort: s.sort === "relevance" ? "" : s.sort,
  page: s.page > 1 ? s.page : "",
});

const hasTitleFilters = (s) => Boolean(s.genre || s.year || s.rating || s.lang);

/** Busca as primeiras páginas em paralelo e junta sem duplicatas. */
async function fetchAggregate(query, signal) {
  const first = await searchMulti(query, 1, { signal });
  const lastPage = Math.min(first.totalPages, LIMITS.searchPages);
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, lastPage - 1) }, (_, i) =>
      searchMulti(query, i + 2, { signal }).catch((error) => {
        if (isAbortError(error)) throw error;
        return { items: [] }; // uma página falhando não derruba a busca inteira
      })
    )
  );
  const seen = new Set();
  const items = [first, ...rest].flatMap((r) => r.items).filter((i) => !seen.has(i.key) && seen.add(i.key));
  return { items, totalResults: first.totalResults };
}

function applyFilters(items, s) {
  const titlesOnly = hasTitleFilters(s);
  let list = items.filter((item) => {
    if (item.mediaType === "person") return s.type === "person" || (s.type === "all" && !titlesOnly);
    if (s.type === "person") return false;
    if (s.type !== "all" && item.mediaType !== s.type) return false;
    if (s.genre && !item.genreIds.includes(Number(s.genre))) return false;
    if (s.year && item.year !== s.year) return false;
    if (s.rating && !(item.rating >= Number(s.rating))) return false;
    if (s.lang && item.originalLanguage !== s.lang) return false;
    return true;
  });
  const by = { popularity: (a, b) => b.popularity - a.popularity, rating: (a, b) => b.rating - a.rating, date: (a, b) => (b.date || "").localeCompare(a.date || "") };
  if (by[s.sort]) list = [...list].sort(by[s.sort]);
  return list;
}

export async function mount(outlet, initialCtx) {
  let ctx = initialCtx;
  let state = readState(ctx.query);
  let aggregate = { query: null, items: [], totalResults: 0 };
  let genreMap = {};

  outlet.innerHTML = html`<div class="container page">
    <header class="page__header">
      <h1 class="page__title" data-title>Pesquisar</h1>
      <p class="page__lead" data-lead></p>
    </header>
    <div class="tabs" role="group" aria-label="Tipo de resultado" data-tabs></div>
    <section class="filters filters--open" aria-label="Filtros da pesquisa" data-filters></section>
    <div class="results-bar" aria-live="polite" data-summary></div>
    <div class="grid" data-grid></div>
    <div data-pager></div>
  </div>`.toString();

  const title = $("[data-title]", outlet);
  const lead = $("[data-lead]", outlet);
  const tabsEl = $("[data-tabs]", outlet);
  const filtersEl = $("[data-filters]", outlet);
  const summary = $("[data-summary]", outlet);
  const grid = $("[data-grid]", outlet);
  const pagerSlot = $("[data-pager]", outlet);

  const go = (next, { replace = true } = {}) => ctx.navigate(buildPath("/busca", toParams({ ...state, ...next })), { replace });

  // ---- UI ----
  /** Re-renderiza um bloco sem perder o foco do teclado no controle ativo. */
  function keepFocus(container, render) {
    const active = document.activeElement;
    const key = container.contains(active) ? active.id || (active.dataset.type ? `[data-type="${active.dataset.type}"]` : "") : "";
    render();
    if (key) (container.querySelector(key.startsWith("[") ? key : `#${key}`) || null)?.focus();
  }

  function renderTabs(counts) {
    keepFocus(tabsEl, () => (tabsEl.innerHTML = TYPES.map(
      (t) => html`<button type="button" class="tab" data-type="${t.value}" aria-pressed="${state.type === t.value}">${t.label}<span class="tab__count">${formatNumber(counts[t.value] ?? 0)}</span></button>`
    ).join("")));
  }

  function renderFilters() {
    const items = aggregate.items.filter((i) => i.mediaType !== "person");
    const genreIds = [...new Set(items.flatMap((i) => i.genreIds))].filter((id) => genreMap[id]);
    const years = [...new Set(items.map((i) => i.year).filter(Boolean))].sort().reverse();
    const langs = [...new Set(items.map((i) => i.originalLanguage).filter(Boolean))];
    const keep = (value, list) => (value && !list.includes(value) ? [value, ...list] : list); // mantém o valor atual vindo da URL

    keepFocus(filtersEl, () => (filtersEl.innerHTML = html`<div class="filters__row filters__row--search">
      ${selectField({
        id: "s-genre",
        label: "Gênero",
        value: state.genre,
        options: [
          { value: "", label: "Todos os gêneros" },
          ...keep(state.genre ? Number(state.genre) : "", genreIds)
            .filter(Boolean)
            .map((id) => ({ value: String(id), label: genreMap[id] || `Gênero ${id}` }))
            .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
        ],
      })}
      ${selectField({ id: "s-year", label: "Ano", value: state.year, options: [{ value: "", label: "Todos os anos" }, ...keep(state.year, years).map((y) => ({ value: y, label: y }))] })}
      ${selectField({ id: "s-rating", label: "Nota mínima", value: state.rating, options: RATING_OPTIONS })}
      ${selectField({
        id: "s-lang",
        label: "Idioma original",
        value: state.lang,
        options: [
          { value: "", label: "Todos os idiomas" },
          ...keep(state.lang, langs).map((l) => ({ value: l, label: languageName(l) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
        ],
      })}
      ${selectField({ id: "s-sort", label: "Ordenar por", value: state.sort, options: SORTS })}
      <button type="button" class="btn btn--ghost filters__clear" data-clear ${state.genre || state.year || state.rating || state.lang || state.sort !== "relevance" ? "" : raw("hidden")}>${raw(icon("rotate-ccw", { size: 16 }))} Limpar filtros</button>
    </div>
    ${hasTitleFilters(state) && state.type === "all" ? html`<p class="filters__note">Com filtros de gênero, ano, nota ou idioma, pessoas ficam de fora dos resultados.</p>` : ""}`.toString()));
  }

  function renderResults() {
    const pool = aggregate.items;
    const counts = { all: 0, movie: 0, tv: 0, person: 0 };
    for (const t of ["all", "movie", "tv", "person"]) counts[t] = applyFilters(pool, { ...state, type: t }).length;
    renderTabs(counts);

    const filtered = applyFilters(pool, state);
    const size = LIMITS.searchPageSize;
    const totalPages = Math.max(1, Math.ceil(filtered.length / size));
    const page = Math.min(state.page, totalPages);
    const slice = filtered.slice((page - 1) * size, page * size);

    if (!slice.length) {
      summary.textContent = "";
      pagerSlot.innerHTML = "";
      grid.innerHTML = emptyState({
        iconName: "search",
        title: "Nada encontrado com esses filtros",
        text: pool.length ? "Remova algum filtro ou troque o tipo de resultado." : `Não encontramos resultados para “${state.q}”.`,
      }).toString();
      return;
    }

    grid.innerHTML = slice.map((item) => (item.mediaType === "person" ? personCard(item, { subtitle: item.department }) : mediaCard(item, { showType: true }))).join("");
    const capped = aggregate.totalResults > pool.length;
    summary.textContent = `${formatNumber(filtered.length)} ${filtered.length === 1 ? "resultado" : "resultados"}${capped ? ` entre os ${formatNumber(pool.length)} mais relevantes` : ""} · página ${page} de ${totalPages}`;
    pagerSlot.innerHTML = pagination({ page, totalPages, hrefFor: (p) => buildPath("/busca", toParams({ ...state, page: p })) }).toString();
  }

  async function load({ refetch, scrollToTop }) {
    if (!state.q) return showTrending();
    title.textContent = `Resultados para “${state.q}”`;
    lead.textContent = "Pesquisa em filmes, séries e pessoas.";
    setMeta({ title: `Busca: ${state.q}`, description: `Resultados da pesquisa por “${state.q}” em filmes, séries e pessoas.`, noindex: true });

    if (refetch || aggregate.query !== state.q) {
      grid.setAttribute("aria-busy", "true");
      grid.innerHTML = cardSkeletons(12).toString();
      pagerSlot.innerHTML = "";
      summary.textContent = "Buscando…";
      try {
        const [result, map] = await Promise.all([
          fetchAggregate(state.q, ctx.signal),
          getGenreMap({ signal: ctx.signal }).catch((e) => (isAbortError(e) ? Promise.reject(e) : {})),
        ]);
        aggregate = { query: state.q, ...result };
        genreMap = map;
      } catch (error) {
        if (isAbortError(error)) return;
        summary.textContent = "";
        grid.innerHTML = errorState(error).toString();
        $("[data-retry]", grid)?.addEventListener("click", () => load({ refetch: true }));
        grid.removeAttribute("aria-busy");
        return;
      }
      grid.removeAttribute("aria-busy");
    }
    renderFilters();
    renderResults();
    if (scrollToTop) $(".tabs", outlet).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function showTrending() {
    title.textContent = "Pesquisar";
    lead.textContent = "Digite um título, série ou nome de pessoa na barra de busca acima.";
    setMeta({ title: "Pesquisar", description: "Pesquise filmes, séries e pessoas.", noindex: true });
    tabsEl.innerHTML = "";
    filtersEl.innerHTML = "";
    pagerSlot.innerHTML = "";
    summary.textContent = "Em alta hoje";
    grid.innerHTML = cardSkeletons(12).toString();
    try {
      const { items } = await getTrending("all", "day", 1, { signal: ctx.signal });
      grid.innerHTML = items.filter((i) => i.mediaType !== "person").map((item) => mediaCard(item, { showType: true })).join("");
    } catch (error) {
      if (isAbortError(error)) return;
      grid.innerHTML = errorState(error).toString();
      $("[data-retry]", grid)?.addEventListener("click", showTrending);
    }
  }

  // ---- eventos ----
  tabsEl.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-type]");
    if (tab) go({ type: tab.dataset.type, page: 1 });
  });
  filtersEl.addEventListener("change", (event) => {
    const map = { "s-genre": "genre", "s-year": "year", "s-rating": "rating", "s-lang": "lang", "s-sort": "sort" };
    const key = map[event.target.id];
    if (key) go({ [key]: event.target.value, page: 1 });
  });
  filtersEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-clear]")) go({ genre: "", year: "", rating: "", lang: "", sort: "relevance", page: 1 });
  });

  await load({ refetch: false });

  return {
    async update(newCtx) {
      const previous = state;
      ctx = newCtx;
      state = readState(ctx.query);
      await load({ refetch: false, scrollToTop: state.page !== previous.page });
    },
  };
}
