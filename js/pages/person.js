// Página de pessoa (ator, diretor...): biografia + filmografia (combined_credits).
import { html, raw, $, isAbortError } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { setMeta } from "../utils/seo.js";
import { getPerson } from "../services/tmdb.js";
import { mediaCard, registerItems } from "../components/card.js";
import { initScroller, railMarkup, renderCards } from "../components/carousel.js";
import { emptyState, errorState } from "../components/states.js";
import { profileUrl } from "../utils/images.js";
import { ageFrom, detailsPath, formatDate, MEDIA_LABEL } from "../utils/format.js";

const PAGE_SIZE = 30;
const FILTERS = [
  { value: "all", label: "Tudo" },
  { value: "movie", label: "Filmes" },
  { value: "tv", label: "Séries" },
];

const DEPARTMENTS = {
  Acting: "Atuação",
  Directing: "Direção",
  Writing: "Roteiro",
  Production: "Produção",
  Sound: "Som",
  Camera: "Fotografia",
  Editing: "Edição",
  Art: "Arte",
  Crew: "Equipe",
};

export async function mount(outlet, ctx) {
  const cleanups = [];

  async function load() {
    outlet.innerHTML = html`<div class="container page"><div class="person" aria-busy="true"><div class="person__photo skeleton"></div><div class="person__info"><div class="skeleton skeleton--title"></div><div class="skeleton skeleton--line"></div><div class="skeleton skeleton--line"></div></div></div></div>`.toString();
    try {
      const person = await getPerson(ctx.params.id, { signal: ctx.signal });
      show(person);
    } catch (error) {
      if (isAbortError(error)) return;
      if (error.notFound) {
        setMeta({ title: "Pessoa não encontrada", noindex: true });
        outlet.innerHTML = html`<div class="container page">${emptyState({ iconName: "user-round", title: "Pessoa não encontrada", action: { href: "/", label: "Voltar ao início" } })}</div>`.toString();
      } else {
        outlet.innerHTML = html`<div class="container page">${errorState(error)}</div>`.toString();
        $("[data-retry]", outlet)?.addEventListener("click", load);
      }
    }
  }

  function show(person) {
    registerItems(person.credits);
    const age = ageFrom(person.birthday, person.deathday);
    const facts = [
      ["Área", DEPARTMENTS[person.department] || person.department],
      ["Nascimento", person.birthday ? `${formatDate(person.birthday)}${age !== null && !person.deathday ? ` (${age} anos)` : ""}` : ""],
      ["Falecimento", person.deathday ? `${formatDate(person.deathday)}${age !== null ? ` (aos ${age} anos)` : ""}` : ""],
      ["Local de nascimento", person.placeOfBirth],
      ["Créditos", person.credits.length ? String(person.credits.length) : ""],
    ].filter(([, value]) => value);

    setMeta({
      title: person.name,
      description: person.biography ? person.biography : `Filmografia de ${person.name}.`,
      image: person.profilePath ? profileUrl(person.profilePath, "h632") : undefined,
    });

    const longBio = person.biography.length > 700;

    outlet.innerHTML = html`<div class="container page person-page">
      <div class="person">
        <div class="person__photo">
          ${person.profilePath ? html`<img src="${profileUrl(person.profilePath, "h632")}" width="300" height="450" alt="Foto de ${person.name}" />` : html`<div class="card__noposter" aria-hidden="true">${raw(icon("user-round", { size: 56 }))}</div>`}
        </div>
        <div class="person__info">
          <h1 class="page__title">${person.name}</h1>
          <dl class="facts facts--inline">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
          <h2 class="block__title">Biografia</h2>
          ${person.biography
            ? html`<div class="bio ${longBio ? "is-clamped" : ""}" data-bio><p>${person.biography}</p></div>
                ${longBio ? html`<button type="button" class="btn btn--ghost btn--sm" data-bio-toggle aria-expanded="false">Ler mais</button>` : ""}`
            : html`<p class="muted">Biografia ainda não disponível em português.</p>`}
        </div>
      </div>
      ${person.knownFor.length ? railMarkup({ title: "Conhecido(a) por", itemsMarkup: renderCards(person.knownFor) }) : ""}
      <section class="block" aria-labelledby="filmography-h">
        <div class="block__head">
          <h2 class="block__title" id="filmography-h">Filmografia</h2>
          <div class="segmented" role="group" aria-label="Filtrar filmografia">
            ${FILTERS.map((f, i) => html`<button type="button" class="segmented__btn" data-filter="${f.value}" aria-pressed="${i === 0}">${f.label}</button>`)}
          </div>
        </div>
        <ul class="filmography" data-list></ul>
        <div class="filmography__more" data-more></div>
      </section>
    </div>`.toString();

    outlet.querySelectorAll(".rail").forEach((rail) => cleanups.push(initScroller(rail)));

    const bio = $("[data-bio]", outlet);
    $("[data-bio-toggle]", outlet)?.addEventListener("click", (event) => {
      const expanded = bio.classList.toggle("is-clamped") === false;
      event.currentTarget.textContent = expanded ? "Ler menos" : "Ler mais";
      event.currentTarget.setAttribute("aria-expanded", String(expanded));
    });

    // --- filmografia (mais recente primeiro) ---
    let filter = "all";
    let shown = PAGE_SIZE;
    const sorted = [...person.credits].sort((a, b) => (b.date || "9999").localeCompare(a.date || "9999"));
    const list = $("[data-list]", outlet);
    const more = $("[data-more]", outlet);

    function renderList() {
      const rows = sorted.filter((c) => filter === "all" || c.mediaType === filter);
      list.innerHTML = rows.length
        ? rows
            .slice(0, shown)
            .map(
              (c) => html`<li class="filmography__row">
                <span class="filmography__year">${c.year || "—"}</span>
                <a class="filmography__title" href="${detailsPath(c.mediaType, c.id)}">${c.title}</a>
                <span class="filmography__role">${MEDIA_LABEL[c.mediaType]}${c.roles.length ? ` · ${c.roles.slice(0, 2).join(", ")}` : ""}</span>
              </li>`
            )
            .join("")
        : `<li class="muted">Nenhum crédito nesta categoria.</li>`;
      more.innerHTML =
        rows.length > shown
          ? `<button type="button" class="btn btn--ghost" data-show-more>Mostrar mais (${rows.length - shown})</button>`
          : "";
    }
    const onClick = (event) => {
      const filterButton = event.target.closest("[data-filter]");
      if (filterButton) {
        filter = filterButton.dataset.filter;
        shown = PAGE_SIZE;
        outlet.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === filterButton)));
        renderList();
      } else if (event.target.closest("[data-show-more]")) {
        shown += PAGE_SIZE;
        renderList();
      }
    };
    outlet.addEventListener("click", onClick);
    cleanups.push(() => outlet.removeEventListener("click", onClick));
    renderList();
  }

  await load();
  return { destroy: () => cleanups.forEach((fn) => fn()) };
}
