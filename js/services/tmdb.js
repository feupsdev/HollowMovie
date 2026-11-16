// Cliente da API. Fala SOMENTE com /api/* (Netlify Function), nunca direto com a TMDB.
// Recursos: cache em memória com TTL, cache persistente para dados estáveis,
// deduplicação de requisições simultâneas, cancelamento (AbortSignal) e 1 retry.

import { API_BASE, LIMITS, STORAGE_KEYS } from "../config.js";
import { sleep } from "../utils/dom.js";
import { todayISO, yearOf } from "../utils/format.js";

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------
export class ApiError extends Error {
  constructor(message, { status = 0, code = "UNKNOWN" } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
  get notFound() {
    return this.status === 404;
  }
}

// ---------------------------------------------------------------------------
// Transporte + cache
// ---------------------------------------------------------------------------
const DEFAULT_TTL = 5 * 60 * 1000;
const STABLE_TTL = 24 * 60 * 60 * 1000;
const MAX_MEMORY_ENTRIES = 250;
const memory = new Map();
const inflight = new Map();

function buildUrl(endpoint, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  query.sort(); // mesma consulta => mesma chave de cache
  const qs = query.toString();
  return `${API_BASE}${endpoint}${qs ? `?${qs}` : ""}`;
}

function readCache(url, persist) {
  const hit = memory.get(url);
  if (hit && hit.expires > Date.now()) return hit.data;
  if (persist) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.apiCache + url) || "null");
      if (stored && stored.expires > Date.now()) {
        memory.set(url, stored);
        return stored.data;
      }
    } catch {
      /* storage indisponível: segue sem cache persistente */
    }
  }
  return undefined;
}

function writeCache(url, data, ttl, persist) {
  const entry = { data, expires: Date.now() + ttl };
  if (memory.size >= MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value);
  memory.set(url, entry);
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEYS.apiCache + url, JSON.stringify(entry));
    } catch {
      /* cota cheia ou storage bloqueado */
    }
  }
}

async function fetchJson(url, attempt = 0) {
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    if (attempt < 1) {
      await sleep(600);
      return fetchJson(url, attempt + 1);
    }
    throw new ApiError("Sem conexão com o servidor. Verifique sua internet.", { code: "NETWORK" });
  }

  if (response.ok) {
    try {
      return await response.json();
    } catch {
      // Ex.: hospedagem estática devolvendo index.html para /api/* (função não implantada).
      throw new ApiError("A API não respondeu corretamente. A Netlify Function está ativa?", {
        status: 502,
        code: "NO_BACKEND",
      });
    }
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    /* corpo não-JSON */
  }

  if ((response.status === 429 || response.status >= 502) && attempt < 1) {
    const retryAfter = Number(response.headers.get("retry-after")) || 1;
    await sleep(Math.min(retryAfter, 3) * 1000);
    return fetchJson(url, attempt + 1);
  }

  throw new ApiError(body?.error || "Não foi possível carregar os dados.", {
    status: response.status,
    code: body?.code || `HTTP_${response.status}`,
  });
}

/** Faz o `await` respeitar o AbortSignal sem cancelar a requisição compartilhada. */
function abortable(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

export function request(endpoint, params, { signal, ttl = DEFAULT_TTL, persist = false } = {}) {
  const url = buildUrl(endpoint, params);
  const cached = readCache(url, persist);
  if (cached !== undefined) return abortable(Promise.resolve(cached), signal);

  let promise = inflight.get(url);
  if (!promise) {
    promise = fetchJson(url)
      .then((data) => {
        writeCache(url, data, persist ? STABLE_TTL : ttl, persist);
        return data;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, promise);
  }
  return abortable(promise, signal);
}

// ---------------------------------------------------------------------------
// Normalização: transforma o JSON cru da TMDB em objetos previsíveis.
// ---------------------------------------------------------------------------
export function normalize(raw, mediaHint) {
  if (!raw || !raw.id) return null;
  const mediaType = raw.media_type || mediaHint || (raw.title || raw.original_title ? "movie" : "tv");
  if (!["movie", "tv", "person"].includes(mediaType)) return null;

  if (mediaType === "person") {
    return {
      key: `person:${raw.id}`,
      id: raw.id,
      mediaType,
      title: raw.name || "",
      profilePath: raw.profile_path || null,
      department: raw.known_for_department || "",
      popularity: raw.popularity || 0,
      knownFor: (raw.known_for || []).map((k) => k.title || k.name).filter(Boolean),
    };
  }

  const date = raw.release_date || raw.first_air_date || "";
  return {
    key: `${mediaType}:${raw.id}`,
    id: raw.id,
    mediaType,
    title: raw.title || raw.name || "Sem título",
    originalTitle: raw.original_title || raw.original_name || "",
    overview: raw.overview || "",
    posterPath: raw.poster_path || null,
    backdropPath: raw.backdrop_path || null,
    date,
    year: yearOf(date),
    rating: raw.vote_average || 0,
    voteCount: raw.vote_count || 0,
    genreIds: raw.genre_ids || (raw.genres || []).map((g) => g.id),
    originalLanguage: raw.original_language || "",
    popularity: raw.popularity || 0,
  };
}

function toList(data, mediaHint) {
  const items = (data?.results || []).map((raw) => normalize(raw, mediaHint)).filter(Boolean);
  return {
    items,
    page: data?.page || 1,
    totalPages: Math.min(data?.total_pages || 1, LIMITS.tmdbMaxPage),
    totalResults: data?.total_results || items.length,
  };
}

// ---------------------------------------------------------------------------
// Gêneros / países / idiomas (dados estáveis => cache persistente de 24h)
// ---------------------------------------------------------------------------
export async function getGenres(mediaType, opts = {}) {
  const data = await request(`/genre/${mediaType}/list`, {}, { ...opts, persist: true });
  return data.genres || [];
}

/** Mapa { id: nome } combinando filmes e séries. */
export async function getGenreMap(opts = {}) {
  const [movie, tv] = await Promise.all([getGenres("movie", opts), getGenres("tv", opts)]);
  const map = {};
  for (const genre of [...movie, ...tv]) map[genre.id] = genre.name;
  return map;
}

export async function getCountries(opts = {}) {
  const data = await request("/configuration/countries", {}, { ...opts, persist: true });
  return Array.isArray(data) ? data.map((c) => c.iso_3166_1).filter(Boolean) : [];
}

export async function getLanguages(opts = {}) {
  const data = await request("/configuration/languages", {}, { ...opts, persist: true });
  return Array.isArray(data) ? data.map((l) => l.iso_639_1).filter((code) => code && code !== "xx") : [];
}

// ---------------------------------------------------------------------------
// Listas
// ---------------------------------------------------------------------------
export const getTrending = async (mediaType = "all", window = "week", page = 1, opts) =>
  toList(await request(`/trending/${mediaType}/${window}`, { page }, opts), mediaType === "all" ? undefined : mediaType);

export const getPopular = async (mediaType, page = 1, opts) =>
  toList(await request(`/${mediaType}/popular`, { page }, opts), mediaType);

export const getTopRated = async (mediaType, page = 1, opts) =>
  toList(await request(`/${mediaType}/top_rated`, { page }, opts), mediaType);

export const getUpcoming = async (page = 1, opts) =>
  toList(await request("/movie/upcoming", { page }, opts), "movie");

export const getNowPlaying = async (page = 1, opts) =>
  toList(await request("/movie/now_playing", { page }, opts), "movie");

export const getRecommendations = async (mediaType, id, page = 1, opts) =>
  toList(await request(`/${mediaType}/${id}/recommendations`, { page }, opts), mediaType);

export const getSimilar = async (mediaType, id, page = 1, opts) =>
  toList(await request(`/${mediaType}/${id}/similar`, { page }, opts), mediaType);

export const searchMulti = async (query, page = 1, opts) =>
  toList(await request("/search/multi", { query, page }, { ttl: 2 * 60 * 1000, ...opts }));

// ---------------------------------------------------------------------------
// Discover (filtros combináveis)
// ---------------------------------------------------------------------------
export const SORT_OPTIONS = {
  popularity: "Popularidade",
  rating: "Melhor avaliação",
  date: "Lançamento mais recente",
};

/**
 * Converte o estado de filtros da UI em parâmetros do /discover.
 * filters: { genres: number[], year, rating, country, language, sort }
 */
export function buildDiscoverParams(mediaType, filters = {}) {
  const isMovie = mediaType === "movie";
  const params = {};

  if (filters.genres?.length) params.with_genres = filters.genres.join(","); // vírgula = E (todos os gêneros)
  if (filters.year) params[isMovie ? "primary_release_year" : "first_air_date_year"] = filters.year;
  if (filters.country) params.with_origin_country = filters.country;
  if (filters.language) params.with_original_language = filters.language;

  let minVotes = 0;
  if (filters.rating) {
    params["vote_average.gte"] = filters.rating;
    minVotes = 100; // sem isso, títulos com 1 voto "10" dominariam o resultado
  }

  switch (filters.sort) {
    case "rating":
      params.sort_by = "vote_average.desc";
      minVotes = Math.max(minVotes, 300);
      break;
    case "date":
      params.sort_by = isMovie ? "primary_release_date.desc" : "first_air_date.desc";
      params[isMovie ? "primary_release_date.lte" : "first_air_date.lte"] = todayISO(); // sem títulos ainda não lançados
      minVotes = Math.max(minVotes, 5);
      break;
    default:
      params.sort_by = "popularity.desc";
  }
  if (minVotes) params["vote_count.gte"] = minVotes;
  return params;
}

export const discover = async (mediaType, filters, page = 1, opts) =>
  toList(await request(`/discover/${mediaType}`, { ...buildDiscoverParams(mediaType, filters), page }, opts), mediaType);

// ---------------------------------------------------------------------------
// Vídeos
// ---------------------------------------------------------------------------
const VIDEO_RANK = { Trailer: 3, Teaser: 2, Clip: 1 };

/** Ordena vídeos do YouTube: trailer > teaser > clipe, oficial e em pt/en primeiro. */
export function rankVideos(videos = []) {
  const score = (v) =>
    (VIDEO_RANK[v.type] || 0) * 10 + (v.official ? 3 : 0) + (v.iso_639_1 === "pt" ? 2 : v.iso_639_1 === "en" ? 1 : 0);
  return videos
    .filter((v) => v.site === "YouTube" && v.key && VIDEO_RANK[v.type])
    .sort((a, b) => score(b) - score(a) || (b.published_at || "").localeCompare(a.published_at || ""))
    .map((v) => ({ key: v.key, name: v.name, type: v.type, lang: v.iso_639_1 }));
}

export async function getVideos(mediaType, id, opts) {
  const data = await request(
    `/${mediaType}/${id}/videos`,
    { include_video_language: "pt,en,null" },
    { ttl: 30 * 60 * 1000, ...opts }
  );
  return rankVideos(data.results);
}

// ---------------------------------------------------------------------------
// Detalhes de filme/série (1 requisição com append_to_response)
// ---------------------------------------------------------------------------
const PROVIDER_GROUPS = [
  ["flatrate", "Streaming"],
  ["free", "Grátis"],
  ["ads", "Grátis com anúncios"],
  ["rent", "Alugar"],
  ["buy", "Comprar"],
];

function shapeProviders(block) {
  const region = block?.results?.BR;
  if (!region) return null;
  const groups = PROVIDER_GROUPS.map(([key, label]) => ({
    key,
    label,
    items: (region[key] || []).map((p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path })),
  })).filter((g) => g.items.length);
  return groups.length ? { link: region.link || "", groups } : null;
}

export async function getDetails(mediaType, id, opts) {
  const raw = await request(
    `/${mediaType}/${id}`,
    {
      append_to_response: "credits,videos,similar,recommendations,watch/providers",
      include_video_language: "pt,en,null",
    },
    { ttl: 10 * 60 * 1000, ...opts }
  );

  const base = normalize({ ...raw, media_type: mediaType }, mediaType);
  const crew = raw.credits?.crew || [];
  const person = (p) => ({ id: p.id, name: p.name });
  const dedupe = (list) => [...new Map(list.map((p) => [p.id, p])).values()];

  const exclude = (list) => list.filter((item) => item && item.key !== base.key);

  return {
    ...base,
    tagline: raw.tagline || "",
    status: raw.status || "",
    genres: raw.genres || [],
    runtime: raw.runtime || 0,
    episodeRuntime: (raw.episode_run_time && raw.episode_run_time[0]) || raw.last_episode_to_air?.runtime || 0,
    numberOfSeasons: raw.number_of_seasons || 0,
    numberOfEpisodes: raw.number_of_episodes || 0,
    seasons: (raw.seasons || []).filter((s) => s.season_number > 0 || (raw.seasons || []).length === 1),
    networks: (raw.networks || []).map((n) => n.name),
    countries: mediaType === "movie" ? (raw.production_countries || []).map((c) => c.iso_3166_1) : raw.origin_country || [],
    homepage: raw.homepage || "",
    cast: (raw.credits?.cast || [])
      .slice(0, 20)
      .map((p) => ({ id: p.id, name: p.name, character: p.character || "", profilePath: p.profile_path || null })),
    directors: dedupe(crew.filter((c) => c.job === "Director").map(person)),
    creators: (raw.created_by || []).map(person),
    writers: dedupe(crew.filter((c) => ["Screenplay", "Writer", "Story"].includes(c.job)).map(person)).slice(0, 3),
    videos: rankVideos(raw.videos?.results),
    providers: shapeProviders(raw["watch/providers"]),
    similar: exclude(toList(raw.similar, mediaType).items),
    recommendations: exclude(toList(raw.recommendations, mediaType).items),
  };
}

// ---------------------------------------------------------------------------
// Pessoa
// ---------------------------------------------------------------------------
export async function getPerson(id, opts) {
  const [raw, credits] = await Promise.all([
    request(`/person/${id}`, {}, { ttl: 10 * 60 * 1000, ...opts }),
    request(`/person/${id}/combined_credits`, {}, { ttl: 10 * 60 * 1000, ...opts }),
  ]);

  // Une atuação e equipe, removendo duplicatas (mesmo título em vários papéis).
  const byKey = new Map();
  const add = (entry, role) => {
    const item = normalize(entry, entry.media_type);
    if (!item || item.mediaType === "person") return;
    const existing = byKey.get(item.key);
    if (existing) {
      if (role && !existing.roles.includes(role)) existing.roles.push(role);
    } else {
      byKey.set(item.key, { ...item, roles: role ? [role] : [], episodeCount: entry.episode_count || 0 });
    }
  };
  (credits.cast || []).forEach((c) => add(c, c.character));
  (credits.crew || []).forEach((c) => add(c, c.job));

  const credited = [...byKey.values()];
  return {
    id: raw.id,
    name: raw.name,
    biography: raw.biography || "",
    birthday: raw.birthday || "",
    deathday: raw.deathday || "",
    placeOfBirth: raw.place_of_birth || "",
    department: raw.known_for_department || "",
    profilePath: raw.profile_path || null,
    credits: credited,
    knownFor: [...credited].filter((c) => c.posterPath).sort((a, b) => b.popularity - a.popularity).slice(0, 18),
  };
}
