// Página de detalhes de filme/série.
import { html, raw, $, isAbortError } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { setMeta, setStructuredData } from "../utils/seo.js";
import { getDetails } from "../services/tmdb.js";
import { favorites, history } from "../services/storage.js";
import { personCard, registerItems } from "../components/card.js";
import { initScroller, railMarkup, renderCards } from "../components/carousel.js";
import { openTrailer, youtubeEmbedUrl } from "../components/modal.js";
import { emptyState, errorState } from "../components/states.js";
import { toast } from "../components/toast.js";
import { backdropSrcset, backdropUrl, logoUrl, posterSrcset, posterUrl } from "../utils/images.js";
import { countryName, formatDate, formatRating, formatRuntime, languageName, MEDIA_LABEL, MEDIA_PATH, pluralize } from "../utils/format.js";

const STATUS_PT = {
  Released: "Lançado",
  "Post Production": "Pós-produção",
  "In Production": "Em produção",
  Planned: "Planejado",
  Rumored: "Rumor",
  Canceled: "Cancelado",
  "Returning Series": "Em exibição",
  Ended: "Finalizada",
  Pilot: "Piloto",
};

const personLinks = (people) =>
  people.map((p) => html`<a href="/${MEDIA_PATH.person}/${p.id}">${p.name}</a>`).reduce((acc, link, i) => (i ? [...acc, ", ", link] : [link]), []);

function crewLine(label, people) {
  if (!people.length) return "";
  return html`<div class="credit"><dt>${label}</dt><dd>${personLinks(people)}</dd></div>`;
}

function ratingRing(item) {
  const rating = formatRating(item.rating, item.voteCount);
  if (!rating) return html`<span class="chip">Sem avaliações ainda</span>`;
  return html`<div class="rating">
    <div class="ring" style="--p: ${Math.round(item.rating * 10)}" role="img" aria-label="Nota ${rating} de 10 no TMDB"><span>${rating}</span></div>
    <div class="rating__text"><strong>Nota TMDB</strong><span>${pluralize(item.voteCount, "voto", "votos")}</span></div>
  </div>`;
}

function durationText(item) {
  if (item.mediaType === "movie") return formatRuntime(item.runtime);
  const parts = [];
  if (item.numberOfSeasons) parts.push(pluralize(item.numberOfSeasons, "temporada", "temporadas"));
  if (item.numberOfEpisodes) parts.push(pluralize(item.numberOfEpisodes, "episódio", "episódios"));
  return parts.join(" · ");
}

function providersMarkup(providers) {
  if (!providers) {
    return html`<p class="muted">Não há dados de disponibilidade para o Brasil no momento.</p>`;
  }
  return html`${providers.groups.map(
    (group) => html`<div class="providers__group">
      <h4>${group.label}</h4>
      <ul class="providers__list">
        ${group.items.map(
          (p) => html`<li class="provider" title="${p.name}">
            ${p.logoPath ? html`<img src="${logoUrl(p.logoPath)}" width="46" height="46" alt="" loading="lazy" />` : ""}
            <span>${p.name}</span>
          </li>`
        )}
      </ul>
    </div>`
  )}
  ${providers.link ? html`<a class="link-ext" href="${providers.link}" target="_blank" rel="noopener noreferrer" data-external>Ver todas as opções ${raw(icon("external-link", { size: 14 }))}</a>` : ""}`;
}

function factsMarkup(item) {
  const rows = [
    ["Título original", item.originalTitle && item.originalTitle !== item.title ? item.originalTitle : ""],
    ["Situação", STATUS_PT[item.status] || item.status],
    [item.mediaType === "movie" ? "Lançamento" : "Estreia", formatDate(item.date)],
    ["Idioma original", languageName(item.originalLanguage)],
    ["País de origem", item.countries.map(countryName).join(", ")],
    [item.networks.length ? "Emissora" : "", item.networks.join(", ")],
    ["Duração por episódio", item.mediaType === "tv" ? formatRuntime(item.episodeRuntime) : ""],
  ].filter(([label, value]) => label && value);
  return html`<dl class="facts">${rows.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>`;
}

function videosSection(item) {
  if (!item.videos.length) {
    return html`<section class="block" id="trailer" aria-labelledby="trailer-h"><h2 class="block__title" id="trailer-h">Trailer</h2>
      <p class="muted">Nenhum trailer disponível para este título.</p></section>`;
  }
  const [main, ...others] = item.videos;
  return html`<section class="block" id="trailer" aria-labelledby="trailer-h">
    <h2 class="block__title" id="trailer-h">Trailer</h2>
    <div class="video-frame">
      <iframe data-player src="${youtubeEmbedUrl(main.key)}" title="${main.name || `Trailer de ${item.title}`}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>
    ${others.length
      ? html`<ul class="video-list" aria-label="Outros vídeos">
          ${[main, ...others.slice(0, 5)].map(
            (video, i) => html`<li><button type="button" class="chip chip--toggle" data-video="${video.key}" aria-pressed="${i === 0}">${video.type === "Trailer" ? "Trailer" : video.type === "Teaser" ? "Teaser" : "Clipe"}${video.lang ? ` · ${video.lang.toUpperCase()}` : ""}</button></li>`
          )}
        </ul>`
      : ""}
  </section>`;
}

function seasonsRail(item) {
  if (item.mediaType !== "tv" || !item.seasons.length) return "";
  const cards = item.seasons.map(
    (season) => html`<div class="rail__item" role="listitem"><article class="card card--season">
      <div class="card__poster">
        ${season.poster_path ? html`<img src="${posterUrl(season.poster_path)}" width="342" height="513" alt="" loading="lazy" decoding="async" />` : html`<div class="card__noposter" aria-hidden="true">${raw(icon("tv", { size: 36 }))}</div>`}
      </div>
      <h3 class="card__title">${season.name}</h3>
      <p class="card__meta">${[season.air_date ? season.air_date.slice(0, 4) : "", `${season.episode_count} ep.`].filter(Boolean).join(" · ")}</p>
    </article></div>`
  );
  return railMarkup({ title: "Temporadas", itemsMarkup: html`${cards}`, className: "rail--block" });
}

function structuredData(item) {
  const data = {
    "@context": "https://schema.org",
    "@type": item.mediaType === "movie" ? "Movie" : "TVSeries",
    name: item.title,
    description: item.overview || undefined,
    image: item.posterPath ? posterUrl(item.posterPath, "w500") : undefined,
    datePublished: item.date || undefined,
    genre: item.genres.map((g) => g.name),
    url: window.location.origin + window.location.pathname,
  };
  if (item.voteCount > 0) {
    data.aggregateRating = { "@type": "AggregateRating", ratingValue: item.rating.toFixed(1), bestRating: 10, ratingCount: item.voteCount };
  }
  return data;
}

function render(item) {
  registerItems([item, ...item.similar, ...item.recommendations]);
  const hasCredits = item.directors.length || item.creators.length || item.writers.length;
  const duration = durationText(item);
  const pageUrl = window.location.href;

  return html`<article class="details" aria-labelledby="details-title">
    <header class="details__hero">
      ${item.backdropPath ? html`<img class="details__backdrop" src="${backdropUrl(item.backdropPath)}" srcset="${backdropSrcset(item.backdropPath)}" sizes="100vw" alt="" fetchpriority="high" />` : ""}
      <div class="details__scrim"></div>
      <div class="container details__grid">
        <div class="details__poster">
          ${item.posterPath
            ? html`<img src="${posterUrl(item.posterPath, "w500")}" srcset="${posterSrcset(item.posterPath)}" sizes="(max-width: 760px) 55vw, 300px" width="500" height="750" alt="Pôster de ${item.title}" />`
            : html`<div class="card__noposter" aria-hidden="true">${raw(icon("clapperboard", { size: 48 }))}</div>`}
        </div>
        <div class="details__info">
          <div class="hero__meta">
            <span class="chip chip--accent">${MEDIA_LABEL[item.mediaType]}</span>
            ${item.year ? html`<span>${item.year}</span>` : ""}
            ${duration ? html`<span>${duration}</span>` : ""}
          </div>
          <h1 class="details__title" id="details-title">${item.title}</h1>
          ${item.originalTitle && item.originalTitle !== item.title ? html`<p class="details__original">Título original: <span lang="${item.originalLanguage}">${item.originalTitle}</span></p>` : ""}
          ${item.tagline ? html`<p class="details__tagline">“${item.tagline}”</p>` : ""}
          ${ratingRing(item)}
          ${item.genres.length
            ? html`<ul class="chips chips--links" aria-label="Gêneros">${item.genres.map(
                (g) => html`<li><a class="chip" href="/${item.mediaType === "movie" ? "filmes" : "series"}?genre=${g.id}">${g.name}</a></li>`
              )}</ul>`
            : ""}
          <div class="details__actions">
            ${item.videos.length ? html`<button type="button" class="btn btn--primary btn--lg" data-trailer>${raw(icon("play", { size: 20 }))} Assistir trailer</button>` : ""}
            <button type="button" class="btn btn--glass btn--lg fav-toggle" data-fav data-type="${item.mediaType}" data-id="${item.id}" aria-pressed="${favorites.has(item.mediaType, item.id)}" aria-label="${favorites.has(item.mediaType, item.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}: ${item.title}">
              ${raw(icon("heart", { size: 20 }))} <span data-fav-label>${favorites.has(item.mediaType, item.id) ? "Nos favoritos" : "Favoritar"}</span>
            </button>
            <button type="button" class="btn btn--glass btn--lg" data-share>${raw(icon("share-2", { size: 20 }))} Compartilhar</button>
          </div>
          <section aria-labelledby="synopsis-h">
            <h2 class="sr-only" id="synopsis-h">Sinopse</h2>
            <p class="details__overview">${item.overview || "Sinopse ainda não disponível em português."}</p>
          </section>
          ${hasCredits
            ? html`<dl class="credits">
                ${crewLine("Direção", item.directors)}
                ${crewLine("Criação", item.creators)}
                ${crewLine("Roteiro", item.writers)}
              </dl>`
            : ""}
        </div>
      </div>
    </header>

    <div class="container details__body">
      <div class="details__main">
        ${item.cast.length
          ? railMarkup({ title: "Elenco principal", itemsMarkup: html`${item.cast.map((p) => html`<div class="rail__item rail__item--person" role="listitem">${personCard({ id: p.id, name: p.name, profilePath: p.profilePath, character: p.character })}</div>`)}`, className: "rail--block" })
          : html`<section class="block"><h2 class="block__title">Elenco principal</h2><p class="muted">Elenco não disponível.</p></section>`}
        ${seasonsRail(item)}
        ${videosSection(item)}
      </div>
      <aside class="details__aside" aria-label="Informações adicionais">
        <section class="panel" aria-labelledby="where-h">
          <h2 class="panel__title" id="where-h">Onde assistir <span class="panel__tag">Brasil</span></h2>
          ${providersMarkup(item.providers)}
          <p class="panel__credit">Disponibilidade por <a href="https://www.justwatch.com" target="_blank" rel="noopener noreferrer" data-external>JustWatch</a>.</p>
        </section>
        <section class="panel" aria-labelledby="facts-h">
          <h2 class="panel__title" id="facts-h">Ficha técnica</h2>
          ${factsMarkup(item)}
          ${item.homepage ? html`<a class="link-ext" href="${item.homepage}" target="_blank" rel="noopener noreferrer" data-external>Site oficial ${raw(icon("external-link", { size: 14 }))}</a>` : ""}
        </section>
      </aside>
    </div>

    <div class="container details__more">
      ${item.recommendations.length ? railMarkup({ title: "Recomendados para quem viu", subtitle: item.title, itemsMarkup: renderCards(item.recommendations.slice(0, 20), { showType: false }) }) : ""}
      ${item.similar.length ? railMarkup({ title: `${item.mediaType === "movie" ? "Filmes" : "Séries"} semelhantes`, itemsMarkup: renderCards(item.similar.slice(0, 20)) }) : ""}
    </div>
  </article>`;
}

export async function mount(outlet, ctx) {
  const { mediaType, id } = ctx.params;
  ctx.setHeader("overlay");
  const cleanups = [];

  async function load() {
    outlet.innerHTML = html`<div class="details details--loading" aria-busy="true"><div class="details__hero"><div class="container details__grid">
      <div class="details__poster skeleton"></div>
      <div class="details__info"><div class="skeleton skeleton--chip"></div><div class="skeleton skeleton--title"></div><div class="skeleton skeleton--line"></div><div class="skeleton skeleton--line"></div><div class="skeleton skeleton--line skeleton--short"></div></div>
    </div></div></div>`.toString();

    try {
      const item = await getDetails(mediaType, id, { signal: ctx.signal });
      outlet.innerHTML = render(item).toString();
      setMeta({
        title: `${item.title}${item.year ? ` (${item.year})` : ""}`,
        description: item.overview || `${MEDIA_LABEL[item.mediaType]} no HollowMovie.`,
        image: item.backdropPath ? backdropUrl(item.backdropPath) : item.posterPath ? posterUrl(item.posterPath, "w500") : undefined,
      });
      setStructuredData(structuredData(item));
      history.push(item);
      bind(item);
    } catch (error) {
      if (isAbortError(error)) return;
      ctx.setHeader("solid");
      if (error.notFound) {
        setMeta({ title: "Título não encontrado", noindex: true });
        outlet.innerHTML = html`<div class="container page">${emptyState({
          iconName: "film",
          title: "Título não encontrado",
          text: "Ele pode ter sido removido da TMDB ou o link está incorreto.",
          action: { href: "/", label: "Voltar ao início" },
        })}</div>`.toString();
      } else {
        outlet.innerHTML = html`<div class="container page">${errorState(error)}</div>`.toString();
        $("[data-retry]", outlet)?.addEventListener("click", load);
      }
    }
  }

  function bind(item) {
    outlet.querySelectorAll(".rail").forEach((rail) => cleanups.push(initScroller(rail)));

    $("[data-trailer]", outlet)?.addEventListener("click", () => openTrailer({ mediaType: item.mediaType, id: item.id, title: item.title }));

    outlet.querySelectorAll("[data-video]").forEach((button) =>
      button.addEventListener("click", () => {
        $("[data-player]", outlet).src = youtubeEmbedUrl(button.dataset.video, true);
        outlet.querySelectorAll("[data-video]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      })
    );

    $("[data-share]", outlet)?.addEventListener("click", async () => {
      const shareData = { title: item.title, text: `${item.title} no HollowMovie`, url: window.location.href };
      try {
        if (navigator.share) await navigator.share(shareData);
        else {
          await navigator.clipboard.writeText(shareData.url);
          toast("Link copiado para a área de transferência.");
        }
      } catch (error) {
        if (error?.name !== "AbortError") toast(`Copie o link: ${shareData.url}`, { duration: 8000 });
      }
    });
  }

  await load();
  return { destroy: () => cleanups.forEach((fn) => fn()) };
}
