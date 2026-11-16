// Carrossel horizontal: rolagem nativa (toque + scroll-snap) com setas no desktop.
// `createRail` monta uma seção completa que carrega os dados sob demanda,
// com skeleton, estado de erro com retry e abas opcionais.
import { html, raw, uniqueId, whenVisible, isAbortError, createElement } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { cardSkeletons, mediaCard, personCard } from "./card.js";
import { errorState } from "./states.js";

/** Liga setas e estado das bordas a um elemento .rail. */
export function initScroller(rail) {
  const track = rail.querySelector(".rail__track");
  const prev = rail.querySelector('[data-rail="prev"]');
  const next = rail.querySelector('[data-rail="next"]');
  if (!track) return () => {};

  let frame = 0;
  const update = () => {
    frame = 0;
    const max = track.scrollWidth - track.clientWidth - 2;
    const atStart = track.scrollLeft <= 2;
    const atEnd = track.scrollLeft >= max;
    rail.dataset.atStart = String(atStart);
    rail.dataset.atEnd = String(atEnd);
    if (prev) prev.disabled = atStart;
    if (next) next.disabled = atEnd;
    rail.classList.toggle("is-scrollable", max > 0);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const scrollByPage = (direction) => {
    track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: "smooth" });
  };
  const onPrev = () => scrollByPage(-1);
  const onNext = () => scrollByPage(1);

  track.addEventListener("scroll", schedule, { passive: true });
  prev?.addEventListener("click", onPrev);
  next?.addEventListener("click", onNext);
  const observer = "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
  observer?.observe(track);
  update();

  return () => {
    track.removeEventListener("scroll", schedule);
    prev?.removeEventListener("click", onPrev);
    next?.removeEventListener("click", onNext);
    observer?.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}

const railControls = () => html`
  <button type="button" class="rail__arrow rail__arrow--prev" data-rail="prev" aria-label="Rolar para a esquerda">${raw(icon("chevron-left", { size: 22 }))}</button>
  <button type="button" class="rail__arrow rail__arrow--next" data-rail="next" aria-label="Rolar para a direita">${raw(icon("chevron-right", { size: 22 }))}</button>`;

/** Carrossel estático (itens já conhecidos): elenco, favoritos, similares... */
export function railMarkup({ id = uniqueId("rail"), title, subtitle = "", href = "", hrefLabel = "Ver tudo", itemsMarkup, className = "" }) {
  return html`<section class="rail ${className}" aria-labelledby="${id}-title">
    <header class="rail__header">
      <div>
        <h2 class="rail__title" id="${id}-title">${title}</h2>
        ${subtitle ? html`<p class="rail__subtitle">${subtitle}</p>` : ""}
      </div>
      ${href ? html`<a class="rail__link" href="${href}">${hrefLabel} ${raw(icon("arrow-right", { size: 16 }))}</a>` : ""}
    </header>
    <div class="rail__viewport">
      ${railControls()}
      <div class="rail__track" role="list">${itemsMarkup}</div>
    </div>
  </section>`;
}

export const renderCards = (items, options) =>
  html`${items.map((item) => html`<div class="rail__item" role="listitem">${item.mediaType === "person" ? personCard(item) : mediaCard(item, options)}</div>`)}`;

/**
 * Seção com carregamento assíncrono.
 * @param {object} options
 * @param {string} options.title
 * @param {(tab: string|undefined, signal: AbortSignal) => Promise<object[]>} options.load
 * @param {{value: string, label: string}[]} [options.tabs]
 * @param {AbortSignal} [options.signal]
 */
export function createRail({ title, subtitle = "", href = "", hrefLabel, tabs = [], load, signal, showType = false, hideWhenEmpty = true, lazy = true, onItems }) {
  const id = uniqueId("rail");
  let activeTab = tabs[0]?.value;
  let cleanupScroller = () => {};
  let stopWatching = () => {};
  let requestId = 0;

  const element = createElement(
    railMarkup({ id, title, subtitle, href, hrefLabel, itemsMarkup: "" }).toString()
  );
  const header = element.querySelector(".rail__header");
  const track = element.querySelector(".rail__track");
  const viewport = element.querySelector(".rail__viewport");

  if (tabs.length) {
    const group = createElement(
      html`<div class="segmented" role="group" aria-label="Período ou tipo de ${title}">
        ${tabs.map(
          (tab) => html`<button type="button" class="segmented__btn" data-tab="${tab.value}" aria-pressed="${tab.value === activeTab}">${tab.label}</button>`
        )}
      </div>`.toString()
    );
    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab]");
      if (!button || button.dataset.tab === activeTab) return;
      activeTab = button.dataset.tab;
      group.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      run();
    });
    header.appendChild(group);
  }

  // Skeleton inicial: reserva espaço e evita "pulo" de layout.
  track.innerHTML = cardSkeletons(8).toString();
  track.setAttribute("aria-busy", "true");
  cleanupScroller = initScroller(element);

  async function run() {
    const current = ++requestId;
    track.setAttribute("aria-busy", "true");
    viewport.classList.remove("is-error");
    track.innerHTML = cardSkeletons(8).toString();
    track.scrollLeft = 0;
    try {
      const items = await load(activeTab, signal);
      if (current !== requestId) return;
      if (!items.length) {
        if (hideWhenEmpty) element.hidden = true;
        else track.innerHTML = `<p class="rail__empty">Nada por aqui ainda.</p>`;
        return;
      }
      element.hidden = false;
      track.innerHTML = renderCards(items, { showType }).toString();
      onItems?.(items);
    } catch (error) {
      if (isAbortError(error) || current !== requestId) return;
      viewport.classList.add("is-error");
      track.innerHTML = errorState(error, { compact: true }).toString();
      track.querySelector("[data-retry]")?.addEventListener("click", run);
    } finally {
      if (current === requestId) {
        track.removeAttribute("aria-busy");
        requestAnimationFrame(() => track.dispatchEvent(new Event("scroll")));
      }
    }
  }

  if (lazy) stopWatching = whenVisible(element, run);
  else run();

  return {
    element,
    destroy() {
      requestId++;
      stopWatching();
      cleanupScroller();
    },
  };
}
