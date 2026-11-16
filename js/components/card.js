// Cards de título e de pessoa + lógica global dos botões de favorito.
import { html, raw, delegate } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { detailsPath, formatRating, MEDIA_LABEL, MEDIA_PATH } from "../utils/format.js";
import { posterSrcset, posterUrl, profileUrl } from "../utils/images.js";
import { favorites } from "../services/storage.js";
import { toast } from "./toast.js";

// Registro key -> item, para que o botão de favorito (que só conhece type/id)
// consiga salvar título, pôster e nota sem nova chamada à API.
const registry = new Map();
export const registerItems = (items) => items.forEach((item) => item?.key && registry.set(item.key, item));

export function favoriteButton(item, { className = "" } = {}) {
  registerItems([item]);
  const active = favorites.has(item.mediaType, item.id);
  return html`<button
    type="button"
    class="fav-btn ${className}"
    data-fav
    data-type="${item.mediaType}"
    data-id="${item.id}"
    aria-pressed="${active}"
    aria-label="${active ? "Remover dos favoritos" : "Adicionar aos favoritos"}: ${item.title}"
    title="${active ? "Remover dos favoritos" : "Adicionar aos favoritos"}"
  >
    ${raw(icon("heart", { size: 18 }))}
  </button>`;
}

const posterPlaceholder = () =>
  html`<div class="card__noposter" aria-hidden="true">${raw(icon("clapperboard", { size: 36 }))}</div>`;

/** Card de filme/série. */
export function mediaCard(item, { showType = false, extraMeta = "" } = {}) {
  registerItems([item]);
  const rating = formatRating(item.rating, item.voteCount);
  const metaParts = [item.year, showType ? MEDIA_LABEL[item.mediaType] : ""].filter(Boolean);
  return html`<article class="card" data-key="${item.key}">
    <a class="card__link" href="${detailsPath(item.mediaType, item.id)}">
      <div class="card__poster">
        ${item.posterPath
          ? html`<img
              src="${posterUrl(item.posterPath)}"
              srcset="${posterSrcset(item.posterPath)}"
              sizes="(max-width: 600px) 40vw, 200px"
              width="342"
              height="513"
              alt=""
              loading="lazy"
              decoding="async"
            />`
          : posterPlaceholder()}
        ${rating ? html`<span class="card__rating" title="Nota no TMDB">${raw(icon("star", { size: 12 }))}${rating}</span>` : ""}
      </div>
      <h3 class="card__title">${item.title}</h3>
      <p class="card__meta">${metaParts.join(" · ")}${extraMeta ? html`<span class="card__extra"> ${extraMeta}</span>` : ""}</p>
    </a>
    ${favoriteButton(item, { className: "card__fav" })}
  </article>`;
}

/** Card de pessoa (elenco, resultados de busca). */
export function personCard(person, { subtitle = "" } = {}) {
  const id = person.id;
  const name = person.title || person.name;
  const photo = person.profilePath;
  const sub = subtitle || person.character || person.department || "";
  return html`<article class="card card--person">
    <a class="card__link" href="/${MEDIA_PATH.person}/${id}">
      <div class="card__poster card__poster--person">
        ${photo
          ? html`<img src="${profileUrl(photo)}" width="185" height="278" alt="" loading="lazy" decoding="async" />`
          : html`<div class="card__noposter" aria-hidden="true">${raw(icon("user-round", { size: 36 }))}</div>`}
      </div>
      <h3 class="card__title">${name}</h3>
      ${sub ? html`<p class="card__meta">${sub}</p>` : ""}
    </a>
  </article>`;
}

export function cardSkeletons(count = 8) {
  return html`${Array.from({ length: count }, () =>
    html`<div class="card card--skeleton" aria-hidden="true">
      <div class="card__poster skeleton"></div>
      <div class="skeleton skeleton--line"></div>
      <div class="skeleton skeleton--line skeleton--short"></div>
    </div>`
  )}`;
}

// ---------------------------------------------------------------------------
// Estado visual dos botões de favorito (todos os que existirem na página)
// ---------------------------------------------------------------------------
function syncButtons() {
  document.querySelectorAll("[data-fav]").forEach((button) => {
    const active = favorites.has(button.dataset.type, button.dataset.id);
    const title = button.getAttribute("aria-label")?.split(": ").slice(1).join(": ") || "";
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", `${active ? "Remover dos favoritos" : "Adicionar aos favoritos"}${title ? `: ${title}` : ""}`);
    button.title = active ? "Remover dos favoritos" : "Adicionar aos favoritos";
    const label = button.querySelector("[data-fav-label]");
    if (label) label.textContent = active ? "Nos favoritos" : "Favoritar";
  });
}

export function initFavoriteButtons() {
  delegate(document, "click", "[data-fav]", (event, button) => {
    event.preventDefault();
    const key = `${button.dataset.type}:${button.dataset.id}`;
    const item = registry.get(key);
    if (!item) return;
    const nowFavorite = favorites.toggle(item);
    if (nowFavorite) {
      toast(`“${item.title}” adicionado aos favoritos.`);
    } else {
      toast(`“${item.title}” removido dos favoritos.`, {
        action: { label: "Desfazer", onClick: () => favorites.add(item) },
      });
    }
  });
  window.addEventListener("hm:favorites", syncButtons);
}

export { syncButtons as syncFavoriteButtons };
