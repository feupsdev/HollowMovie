// Filmes e Séries: /discover com filtros combináveis, ordenação e paginação.
// O estado dos filtros vive na URL (?genre=28,12&year=2024&rating=7...), então é
// compartilhável, funciona com o botão Voltar e nunca "apaga" filtros anteriores.
import { html, raw, $, $$, isAbortError } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { setMeta } from "../utils/seo.js";
import { buildPath } from "../router.js";
import { discover, getCountries, getGenres, getLanguages, SORT_OPTIONS } from "../services/tmdb.js";
import { cardSkeletons, mediaCard } from "../components/card.js";
import { emptyState, errorState } from "../components/states.js";
import { pagination } from "../components/pagination.js";
import { RATING_OPTIONS, selectField, yearOptions } from "../components/forms.js";
import { countryName, formatNumber, languageName } from "../utils/format.js";
import { POPULAR_COUNTRIES, POPULAR_LANGUAGES } from "../config.js";

const COPY = {
  movie: {
    path: "/filmes",
    title: "Filmes",
    lead: "Explore o catálogo e combine filtros para achar o filme certo.",
    description: "Explore filmes por gênero, ano, nota, país e idioma. Dados da TMDB.",
  },
  tv: {
    path: "/series",
    title: "Séries",
    lead: "De dramas aclamados a maratonas leves: filtre e descubra.",
    description: "Explore séries por gênero, ano, nota, país e idioma. Dados da TMDB.",
  },
};

function readState(query) {
  const page = Number(query.get("page"));
  return {
    genres: (query.get("genre") || "").split(",").map(Number).filter(Boolean),
    year: /^\d{4}$/.test(query.get("year") || "") ? query.get("year") : "",
    rating: ["5", "6", "7", "8", "9"].includes(query.get("rating")) ? query.get("rating") : "",
    country: /^[A-Z]{2}$/.test(query.get("country") || "") ? query.get("country") : "",
    language: /^[a-z]{2,3}$/.test(query.get("lang") || "") ? query.get("lang") : "",
    sort: SORT_OPTIONS[query.get("sort")] ? query.get("sort") : "popularity",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

const toParams = (state) => ({
  genre: state.genres,
  year: state.year,
  rating: state.rating,
  country: state.country,
  lang: state.language,
  sort: state.sort === "popularity" ? "" : state.sort,
  page: state.page > 1 ? state.page : "",
});

const activeFilterCount = (s) => s.genres.length + [s.year, s.rating, s.country, s.language].filter(Boolean).length + (s.sort !== "popularity" ? 1 : 0);

function groupedOptions(codes, popular, nameOf, emptyLabel) {
  const byName = (a, b) => a.label.localeCompare(b.label, "pt-BR");
  const toOption = (code) => ({ value: code, label: nameOf(code) });
  const popularSet = new Set(popular);
  const head = popular.filter((c) => !codes.length || codes.includes(c)).map(toOption);
  const rest = codes.filter((c) => !popularSet.has(c)).map(toOption).sort(byName);
  return [{ value: "", label: emptyLabel }, { label: "Mais buscados", options: head }, ...(rest.length ? [{ label: "Todos", options: rest }] : [])];
}

export async function mount(outlet, initialCtx) {
  let ctx = initialCtx;
  const { mediaType } = ctx.params;
  const copy = COPY[mediaType];
  let state = readState(ctx.query);
  let genres = [];
  let countryOptions = groupedOptions([], POPULAR_COUNTRIES, countryName, "Todos os países");
  let languageOptions = groupedOptions([], POPULAR_LANGUAGES, languageName, "Todos os idiomas");

  setMeta({ title: copy.title, description: copy.description });

  outlet.innerHTML = html`<div class="container page">
    <header class="page__header">
      <h1 class="page__title">${copy.title}</h1>
      <p class="page__lead">${copy.lead}</p>
    </header>
    <section class="filters" aria-label="Filtros">
      <button type="button" class="btn btn--ghost filters__toggle" data-filters-toggle aria-expanded="false" aria-controls="filters-panel">
        ${raw(icon("sliders-horizontal", { size: 18 }))} Filtros <span class="badge badge--inline" data-filter-count hidden></span>
      </button>
      <div class="filters__panel" id="filters-panel" data-filters-panel></div>
    </section>
    <div class="results-bar" aria-live="polite" data-summary></div>
    <div class="grid" data-grid></div>
    <div data-pager></div>
  </div>`.toString();

  const panel = $("[data-filters-panel]", outlet);
  const grid = $("[data-grid]", outlet);
  const summary = $("[data-summary]", outlet);
  const pagerSlot = $("[data-pager]", outlet);
  const toggleButton = $("[data-filters-toggle]", outlet);
  const countBadge = $("[data-filter-count]", outlet);

  // ------------ filtros ------------
  function renderFilters() {
    panel.innerHTML = html`
      <div class="chips" role="group" aria-label="Gêneros (combine vários)">
        ${genres.map(
          (genre) => html`<button type="button" class="chip chip--toggle" data-genre="${genre.id}" aria-pressed="${state.genres.includes(genre.id)}">${genre.name}</button>`
        )}
      </div>
      <div class="filters__row">
        ${selectField({ id: "f-year", label: "Ano", value: state.year, options: yearOptions() })}
        ${selectField({ id: "f-rating", label: "Nota mínima", value: state.rating, options: RATING_OPTIONS })}
        ${selectField({ id: "f-country", label: "País de origem", value: state.country, options: countryOptions })}
        ${selectField({ id: "f-language", label: "Idioma original", value: state.language, options: languageOptions })}
        ${selectField({
          id: "f-sort",
          label: "Ordenar por",
          value: state.sort,
          options: Object.entries(SORT_OPTIONS).map(([value, label]) => ({ value, label })),
        })}
        <button type="button" class="btn btn--ghost filters__clear" data-clear>${raw(icon("rotate-ccw", { size: 16 }))} Limpar filtros</button>
      </div>`.toString();
    syncFilterBadge();
  }

  function syncFilterBadge() {
    const count = activeFilterCount(state);
    countBadge.textContent = String(count);
    countBadge.hidden = count === 0;
    $("[data-clear]", panel).hidden = count === 0;
  }

  /** Atualiza os controles já existentes a partir do estado (sem recriar => não perde o foco). */
  function syncControls() {
    $$("[data-genre]", panel).forEach((chip) => chip.setAttribute("aria-pressed", String(state.genres.includes(Number(chip.dataset.genre)))));
    $("#f-year", panel).value = state.year;
    $("#f-rating", panel).value = state.rating;
    $("#f-country", panel).value = state.country;
    $("#f-language", panel).value = state.language;
    $("#f-sort", panel).value = state.sort;
    syncFilterBadge();
  }

  function pushFilters(next, { resetPage = true } = {}) {
    const merged = { ...state, ...next, page: resetPage ? 1 : next.page ?? state.page };
    ctx.navigate(buildPath(copy.path, toParams(merged)), { replace: true });
  }

  panel.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-genre]");
    if (chip) {
      const id = Number(chip.dataset.genre);
      const next = state.genres.includes(id) ? state.genres.filter((g) => g !== id) : [...state.genres, id];
      pushFilters({ genres: next });
    } else if (event.target.closest("[data-clear]")) {
      ctx.navigate(copy.path, { replace: true });
    }
  });
  panel.addEventListener("change", (event) => {
    const map = { "f-year": "year", "f-rating": "rating", "f-country": "country", "f-language": "language", "f-sort": "sort" };
    const key = map[event.target.id];
    if (key) pushFilters({ [key]: event.target.value });
  });
  toggleButton.addEventListener("click", () => {
    const open = !panel.classList.contains("is-open");
    panel.classList.toggle("is-open", open);
    toggleButton.setAttribute("aria-expanded", String(open));
  });

  // ------------ resultados ------------
  async function loadResults({ scrollToTop = false } = {}) {
    grid.setAttribute("aria-busy", "true");
    grid.innerHTML = cardSkeletons(12).toString();
    pagerSlot.innerHTML = "";
    try {
      const result = await discover(mediaType, state, state.page, { signal: ctx.signal });
      if (!result.items.length) {
        summary.textContent = "";
        grid.innerHTML = emptyState({
          iconName: "search",
          title: "Nenhum título encontrado",
          text: "Tente remover alguns filtros ou ampliar o intervalo de ano e nota.",
        }).toString();
        return;
      }
      grid.innerHTML = result.items.map((item) => mediaCard(item)).join("");
      summary.textContent = `${formatNumber(result.totalResults)} títulos · página ${result.page} de ${formatNumber(result.totalPages)}`;
      pagerSlot.innerHTML = pagination({
        page: result.page,
        totalPages: result.totalPages,
        hrefFor: (page) => buildPath(copy.path, toParams({ ...state, page })),
      }).toString();
      if (scrollToTop) $(".filters", outlet).scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (isAbortError(error)) return;
      grid.innerHTML = errorState(error).toString();
      $("[data-retry]", grid)?.addEventListener("click", () => loadResults());
    } finally {
      grid.removeAttribute("aria-busy");
    }
  }

  // Listas de gêneros/países/idiomas (falhas não impedem a página de funcionar).
  const [genreList, countries, languages] = await Promise.all([
    getGenres(mediaType, { signal: ctx.signal }).catch((e) => (isAbortError(e) ? Promise.reject(e) : [])),
    getCountries({ signal: ctx.signal }).catch((e) => (isAbortError(e) ? Promise.reject(e) : [])),
    getLanguages({ signal: ctx.signal }).catch((e) => (isAbortError(e) ? Promise.reject(e) : [])),
  ]);
  genres = genreList;
  countryOptions = groupedOptions(countries, POPULAR_COUNTRIES, countryName, "Todos os países");
  languageOptions = groupedOptions(languages, POPULAR_LANGUAGES, languageName, "Todos os idiomas");
  renderFilters();
  await loadResults();

  return {
    async update(newCtx) {
      const previousPage = state.page;
      ctx = newCtx;
      state = readState(ctx.query);
      syncControls();
      await loadResults({ scrollToTop: state.page !== previousPage });
    },
  };
}
