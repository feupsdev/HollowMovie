// Banner principal com títulos em destaque (rotação automática pausável).
import { html, raw, delegate } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { backdropSrcset, backdropUrl } from "../utils/images.js";
import { detailsPath, formatRating, MEDIA_LABEL } from "../utils/format.js";
import { favoriteButton } from "./card.js";
import { openTrailer } from "./modal.js";
import { prefs } from "../services/storage.js";

const INTERVAL_MS = 8000;

export function heroSkeleton() {
  return html`<section class="hero hero--skeleton" aria-label="Carregando destaques" aria-busy="true">
    <div class="hero__content container">
      <div class="skeleton skeleton--chip"></div>
      <div class="skeleton skeleton--title"></div>
      <div class="skeleton skeleton--line"></div>
      <div class="skeleton skeleton--line skeleton--short"></div>
    </div>
  </section>`;
}

/**
 * @param {HTMLElement} container
 * @param {object[]} items   itens normalizados (com backdropPath)
 * @param {Record<number,string>} genreMap
 */
export function mountHero(container, items, genreMap = {}) {
  const slides = items.map((item, index) => {
    const rating = formatRating(item.rating, item.voteCount);
    const genres = (item.genreIds || []).map((id) => genreMap[id]).filter(Boolean).slice(0, 3);
    return html`<article class="hero__slide ${index === 0 ? "is-active" : ""}" data-index="${index}" role="group" aria-roledescription="slide" aria-label="${index + 1} de ${items.length}" ${index === 0 ? "" : raw("aria-hidden=\"true\" inert")}>
      <img class="hero__bg" src="${backdropUrl(item.backdropPath)}" srcset="${backdropSrcset(item.backdropPath)}" sizes="100vw" alt="" ${index === 0 ? raw('fetchpriority="high"') : raw('loading="lazy"')} decoding="async" />
      <div class="hero__content container">
        <div class="hero__meta">
          <span class="chip chip--accent">${MEDIA_LABEL[item.mediaType]}</span>
          ${rating ? html`<span class="hero__rating">${raw(icon("star", { size: 14 }))} ${rating}</span>` : ""}
          ${item.year ? html`<span>${item.year}</span>` : ""}
          ${genres.length ? html`<span class="hero__genres">${genres.join(" · ")}</span>` : ""}
        </div>
        <h2 class="hero__title">${item.title}</h2>
        <p class="hero__overview">${item.overview}</p>
        <div class="hero__actions">
          <a class="btn btn--primary btn--lg" href="${detailsPath(item.mediaType, item.id)}">${raw(icon("info", { size: 20 }))} Ver detalhes</a>
          <button type="button" class="btn btn--glass btn--lg" data-trailer data-index="${index}">${raw(icon("play", { size: 20 }))} Assistir trailer</button>
          ${favoriteButton(item, { className: "fav-btn--lg" })}
        </div>
      </div>
    </article>`;
  });

  const dots = items.map(
    (item, index) => html`<button type="button" class="hero__dot ${index === 0 ? "is-active" : ""}" data-dot="${index}" aria-label="Destaque ${index + 1}: ${item.title}" aria-current="${index === 0}"><span></span></button>`
  );

  container.innerHTML = html`<section class="hero" aria-roledescription="carousel" aria-label="Títulos em destaque" data-autoplay="${prefs.get().heroAutoplay}">
    <div class="hero__slides">${slides}</div>
    <div class="hero__controls container">
      <div class="hero__dots" role="group" aria-label="Escolher destaque">${dots}</div>
      <button type="button" class="icon-btn hero__pause" data-pause aria-label="Pausar rotação automática"></button>
    </div>
  </section>`.toString();

  const hero = container.querySelector(".hero");
  const slideEls = [...hero.querySelectorAll(".hero__slide")];
  const dotEls = [...hero.querySelectorAll(".hero__dot")];
  const pauseBtn = hero.querySelector("[data-pause]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let index = 0;
  let timer = 0;
  let userPaused = !prefs.get().heroAutoplay || reduceMotion.matches;
  let hoverPaused = false;

  function show(next) {
    index = (next + items.length) % items.length;
    slideEls.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle("is-active", active);
      slide.toggleAttribute("inert", !active);
      slide.setAttribute("aria-hidden", String(!active));
    });
    dotEls.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
      dot.setAttribute("aria-current", String(i === index));
    });
    restart();
  }

  function stop() {
    clearTimeout(timer);
    hero.classList.remove("is-playing");
  }
  function restart() {
    stop();
    if (userPaused || hoverPaused || document.hidden || items.length < 2) return;
    // reinicia a animação da barra de progresso do ponto ativo
    hero.classList.remove("is-playing");
    void hero.offsetWidth;
    hero.classList.add("is-playing");
    timer = setTimeout(() => show(index + 1), INTERVAL_MS);
  }

  function syncPauseButton() {
    pauseBtn.innerHTML = userPaused
      ? icon("play", { size: 18 })
      : `<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`;
    pauseBtn.setAttribute("aria-label", userPaused ? "Retomar rotação automática" : "Pausar rotação automática");
  }

  const cleanups = [
    delegate(hero, "click", "[data-dot]", (_e, dot) => show(Number(dot.dataset.dot))),
    delegate(hero, "click", "[data-trailer]", (_e, button) => {
      const item = items[Number(button.dataset.index)];
      openTrailer({ mediaType: item.mediaType, id: item.id, title: item.title });
    }),
    delegate(hero, "click", "[data-pause]", () => {
      userPaused = !userPaused;
      syncPauseButton();
      restart();
    }),
  ];

  const onEnter = () => {
    hoverPaused = true;
    stop();
  };
  const onLeave = () => {
    hoverPaused = false;
    restart();
  };
  hero.addEventListener("mouseenter", onEnter);
  hero.addEventListener("mouseleave", onLeave);
  hero.addEventListener("focusin", onEnter);
  hero.addEventListener("focusout", onLeave);
  const onVisibility = () => (document.hidden ? stop() : restart());
  document.addEventListener("visibilitychange", onVisibility);

  // Swipe no celular
  let touchX = null;
  hero.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
  hero.addEventListener(
    "touchend",
    (e) => {
      if (touchX === null) return;
      const delta = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(delta) > 50) show(index + (delta < 0 ? 1 : -1));
    },
    { passive: true }
  );

  syncPauseButton();
  restart();

  return () => {
    stop();
    cleanups.forEach((fn) => fn());
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
