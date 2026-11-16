// Página inicial: hero + carrosséis alimentados pela TMDB.
import { html } from "../utils/dom.js";
import { setMeta } from "../utils/seo.js";
import { createRail, initScroller, railMarkup, renderCards } from "../components/carousel.js";
import { heroSkeleton, mountHero } from "../components/hero.js";
import { errorState } from "../components/states.js";
import {
  getGenreMap,
  getNowPlaying,
  getPopular,
  getRecommendations,
  getSimilar,
  getTopRated,
  getTrending,
  getUpcoming,
} from "../services/tmdb.js";
import { favorites, history } from "../services/storage.js";
import { isAbortError, createElement } from "../utils/dom.js";

const withoutPeople = (items) => items.filter((item) => item.mediaType !== "person");

/** O título mais recentemente visto/favoritado vira "semente" das recomendações. */
function pickSeed() {
  const candidates = [
    ...history.list(1).map((h) => ({ ...h, at: h.viewedAt, reason: "viu" })),
    ...favorites.list().slice(0, 1).map((f) => ({ ...f, at: f.addedAt, reason: "favoritou" })),
  ].sort((a, b) => b.at - a.at);
  return candidates[0] || null;
}

async function loadRecommendations(seed, signal) {
  const known = new Set([...history.list().map((h) => h.key), ...favorites.list().map((f) => `${f.mediaType}:${f.id}`), `${seed.mediaType}:${seed.id}`]);
  const [recommended, similar] = await Promise.all([
    getRecommendations(seed.mediaType, seed.id, 1, { signal }),
    getSimilar(seed.mediaType, seed.id, 1, { signal }),
  ]);
  const merged = [...recommended.items, ...similar.items];
  const seen = new Set();
  return merged.filter((item) => {
    if (known.has(item.key) || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}

export async function mount(outlet, ctx) {
  ctx.setHeader("overlay");
  setMeta({});

  outlet.innerHTML = html`
    <h1 class="sr-only">HollowMovie — descubra filmes e séries</h1>
    <div data-hero>${heroSkeleton()}</div>
    <div class="container home__rails" data-rails></div>`.toString();

  const heroSlot = outlet.querySelector("[data-hero]");
  const railsSlot = outlet.querySelector("[data-rails]");
  const cleanups = [];
  const rails = [];

  // ---------------- Hero ----------------
  async function loadHero() {
    heroSlot.innerHTML = heroSkeleton().toString();
    try {
      const [trending, genreMap] = await Promise.all([
        getTrending("all", "week", 1, { signal: ctx.signal }),
        getGenreMap({ signal: ctx.signal }).catch(() => ({})),
      ]);
      let candidates = withoutPeople(trending.items).filter((item) => item.backdropPath && item.overview);
      if (candidates.length < 3) candidates = withoutPeople(trending.items).filter((item) => item.backdropPath);
      if (!candidates.length) throw new Error("Sem destaques disponíveis.");
      cleanups.push(mountHero(heroSlot, candidates.slice(0, 6), genreMap));
    } catch (error) {
      if (isAbortError(error)) return;
      heroSlot.innerHTML = html`<div class="container hero-error">${errorState(error)}</div>`.toString();
      heroSlot.querySelector("[data-retry]")?.addEventListener("click", loadHero);
    }
  }

  // ---------------- Carrosséis ----------------
  const add = (rail) => {
    rails.push(rail);
    railsSlot.appendChild(rail.element);
  };

  // Vistos recentemente (só se houver histórico — dados locais do usuário)
  const recent = history.list(15);
  if (recent.length) {
    const element = createElement(
      railMarkup({
        title: "Continue explorando",
        subtitle: "Títulos que você visitou recentemente",
        href: "/perfil",
        hrefLabel: "Ver histórico",
        itemsMarkup: renderCards(recent.map((entry) => ({ ...entry, key: `${entry.mediaType}:${entry.id}` }))),
      }).toString()
    );
    railsSlot.appendChild(element);
    cleanups.push(initScroller(element));
  }

  add(
    createRail({
      title: "Tendências",
      subtitle: "O que todo mundo está assistindo",
      tabs: [
        { value: "day", label: "Hoje" },
        { value: "week", label: "Semana" },
      ],
      showType: true,
      lazy: false,
      signal: ctx.signal,
      load: async (tab, signal) => withoutPeople((await getTrending("all", tab, 1, { signal })).items),
    })
  );

  // Recomendações: personalizadas quando há histórico/favoritos; senão, o que está em cartaz.
  const seed = pickSeed();
  add(
    seed
      ? createRail({
          title: `Porque você ${seed.reason} “${seed.title}”`,
          subtitle: "Recomendações da TMDB para você",
          showType: true,
          signal: ctx.signal,
          load: (_tab, signal) => loadRecommendations(seed, signal),
        })
      : createRail({
          title: "Em cartaz nos cinemas",
          subtitle: "Abra um título para começarmos a recomendar com base no seu gosto",
          signal: ctx.signal,
          load: async (_tab, signal) => (await getNowPlaying(1, { signal })).items,
        })
  );

  add(
    createRail({
      title: "Filmes populares",
      href: "/filmes",
      hrefLabel: "Explorar filmes",
      signal: ctx.signal,
      load: async (_t, signal) => (await getPopular("movie", 1, { signal })).items,
    })
  );

  add(
    createRail({
      title: "Séries populares",
      href: "/series",
      hrefLabel: "Explorar séries",
      signal: ctx.signal,
      load: async (_t, signal) => (await getPopular("tv", 1, { signal })).items,
    })
  );

  add(
    createRail({
      title: "Mais bem avaliados",
      subtitle: "Os favoritos da crítica e do público",
      tabs: [
        { value: "movie", label: "Filmes" },
        { value: "tv", label: "Séries" },
      ],
      signal: ctx.signal,
      load: async (tab, signal) => (await getTopRated(tab, 1, { signal })).items,
    })
  );

  add(
    createRail({
      title: "Lançamentos",
      subtitle: "Estreias no Brasil",
      tabs: [
        { value: "now", label: "Em cartaz" },
        { value: "soon", label: "Em breve" },
      ],
      signal: ctx.signal,
      load: async (tab, signal) =>
        tab === "soon" ? (await getUpcoming(1, { signal })).items : (await getNowPlaying(1, { signal })).items,
    })
  );

  await loadHero();

  return {
    destroy() {
      cleanups.forEach((fn) => fn());
      rails.forEach((rail) => rail.destroy());
    },
  };
}
