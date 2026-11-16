/**
 * Proxy seguro para a API da TMDB (Netlify Functions v2).
 *
 * Por que existe:
 *  - A chave da TMDB NUNCA chega ao navegador. Ela vive em variável de ambiente.
 *  - O front-end chama /api/<endpoint-da-tmdb>; esta função valida, anexa a
 *    credencial e repassa a requisição.
 *  - Apenas endpoints e parâmetros conhecidos são aceitos (allowlist), então o
 *    proxy não pode ser usado como "relay" genérico para a API.
 *
 * Variáveis de ambiente:
 *  - TMDB_API_KEY          (obrigatória) chave v3 OU "Read Access Token" v4 (JWT).
 *  - TMDB_API_BASE_URL     (opcional)    só para testes; padrão https://api.themoviedb.org/3
 */

const DEFAULT_BASE_URL = "https://api.themoviedb.org/3";
const UPSTREAM_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Allowlist de endpoints (relativos a /3)
// ---------------------------------------------------------------------------
const ID = "[0-9]{1,9}";
const ALLOWED_PATHS = [
  new RegExp("^/trending/(all|movie|tv|person)/(day|week)$"),
  new RegExp("^/movie/(popular|top_rated|upcoming|now_playing)$"),
  new RegExp("^/tv/(popular|top_rated|on_the_air|airing_today)$"),
  new RegExp("^/search/(multi|movie|tv|person)$"),
  new RegExp("^/discover/(movie|tv)$"),
  new RegExp("^/genre/(movie|tv)/list$"),
  new RegExp("^/configuration/(countries|languages)$"),
  new RegExp(`^/(movie|tv)/${ID}$`),
  new RegExp(`^/(movie|tv)/${ID}/(credits|videos|similar|recommendations|watch/providers|external_ids)$`),
  new RegExp(`^/tv/${ID}/season/[0-9]{1,3}$`),
  new RegExp(`^/person/${ID}$`),
  new RegExp(`^/person/${ID}/combined_credits$`),
];

// ---------------------------------------------------------------------------
// Allowlist de parâmetros (nome -> validador do valor)
// ---------------------------------------------------------------------------
const SAFE_TEXT = /^[\p{L}\p{N}\s.,:;'"!?&()\-_/+|%@#]{0,200}$/u;
const NUMBER = /^[0-9]{1,6}$/;
const DECIMAL = /^[0-9]{1,4}(\.[0-9]{1,2})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CSV_IDS = /^[0-9]{1,6}([,|][0-9]{1,6}){0,19}$/;
const LANG = /^[a-z]{2}(-[A-Z]{2})?$/;
const COUNTRY = /^[A-Z]{2}$/;
const SORT = /^[a-z_.]{3,40}$/;
const APPEND = /^(credits|videos|similar|recommendations|watch\/providers|external_ids)(,(credits|videos|similar|recommendations|watch\/providers|external_ids)){0,5}$/;
const VIDEO_LANGS = /^[a-z]{2}(-[A-Z]{2})?(,([a-z]{2}(-[A-Z]{2})?|null)){0,5}$/;

const ALLOWED_PARAMS = {
  page: (v) => NUMBER.test(v) && Number(v) >= 1 && Number(v) <= 500,
  query: (v) => v.length > 0 && SAFE_TEXT.test(v),
  language: (v) => LANG.test(v),
  region: (v) => COUNTRY.test(v),
  sort_by: (v) => SORT.test(v),
  with_genres: (v) => CSV_IDS.test(v),
  without_genres: (v) => CSV_IDS.test(v),
  primary_release_year: (v) => /^\d{4}$/.test(v),
  first_air_date_year: (v) => /^\d{4}$/.test(v),
  year: (v) => /^\d{4}$/.test(v),
  "primary_release_date.gte": (v) => DATE.test(v),
  "primary_release_date.lte": (v) => DATE.test(v),
  "first_air_date.gte": (v) => DATE.test(v),
  "first_air_date.lte": (v) => DATE.test(v),
  "vote_average.gte": (v) => DECIMAL.test(v),
  "vote_average.lte": (v) => DECIMAL.test(v),
  "vote_count.gte": (v) => NUMBER.test(v),
  with_origin_country: (v) => COUNTRY.test(v),
  with_original_language: (v) => /^[a-z]{2,3}$/.test(v),
  append_to_response: (v) => APPEND.test(v),
  include_video_language: (v) => VIDEO_LANGS.test(v),
  watch_region: (v) => COUNTRY.test(v),
};

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/** Extrai o endpoint da TMDB a partir da URL pública ou da URL interna da função. */
export function extractEndpoint(pathname) {
  const match = pathname.match(/^(?:\/api|\/\.netlify\/functions\/tmdb)(\/.*)$/);
  return match ? match[1].replace(/\/+$/, "") : null;
}

export function isAllowedPath(endpoint) {
  return ALLOWED_PATHS.some((re) => re.test(endpoint));
}

/**
 * Filtra os parâmetros recebidos. Retorna { params } ou { error }.
 * Qualquer parâmetro desconhecido (inclusive api_key) é descartado em silêncio;
 * parâmetro conhecido com valor inválido gera erro 400.
 */
export function sanitizeParams(searchParams) {
  const clean = new URLSearchParams();
  for (const [key, value] of searchParams) {
    const validate = ALLOWED_PARAMS[key];
    if (!validate) continue;
    if (!validate(value)) return { error: `Valor inválido para "${key}".` };
    clean.set(key, value);
  }
  return { params: clean };
}

/** Escolhe o cache de acordo com o quão estável é o dado. */
function cacheHeaders(endpoint) {
  let browserSeconds = 60;
  let cdnSeconds = 600;
  if (/^\/(genre|configuration)\//.test(endpoint)) {
    browserSeconds = 86400;
    cdnSeconds = 604800;
  } else if (/^\/(movie|tv|person)\/[0-9]+/.test(endpoint)) {
    browserSeconds = 300;
    cdnSeconds = 3600;
  } else if (/^\/search\//.test(endpoint)) {
    browserSeconds = 120;
    cdnSeconds = 600;
  }
  return {
    "Cache-Control": `public, max-age=${browserSeconds}`,
    // O CDN do Netlify respeita este cabeçalho e varia o cache pela query string.
    "Netlify-CDN-Cache-Control": `public, s-maxage=${cdnSeconds}, stale-while-revalidate=${cdnSeconds * 6}`,
    "Netlify-Vary": "query",
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(request) {
  if (request.method !== "GET") {
    return json({ error: "Método não permitido." }, 405, { Allow: "GET" });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return json(
      {
        error: "TMDB_API_KEY não configurada no servidor.",
        code: "MISSING_API_KEY",
      },
      500,
      { "Cache-Control": "no-store" }
    );
  }

  const url = new URL(request.url);
  const endpoint = extractEndpoint(url.pathname);
  if (!endpoint || !isAllowedPath(endpoint)) {
    return json({ error: "Endpoint não permitido.", code: "FORBIDDEN_ENDPOINT" }, 403);
  }

  const { params, error } = sanitizeParams(url.searchParams);
  if (error) return json({ error, code: "BAD_PARAM" }, 400);

  // Padrões do produto: português do Brasil, região BR, sem conteúdo adulto.
  if (!params.has("language")) params.set("language", "pt-BR");
  if (!params.has("region") && /^\/(movie|trending|discover|search)/.test(endpoint)) {
    params.set("region", "BR");
  }
  params.set("include_adult", "false");

  const headers = { Accept: "application/json" };
  // Chave v4 (JWT, começa com "eyJ") vai em Authorization; chave v3 vai na query.
  if (apiKey.startsWith("eyJ")) headers.Authorization = `Bearer ${apiKey}`;
  else params.set("api_key", apiKey);

  const base = (process.env.TMDB_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const upstreamUrl = `${base}${endpoint}?${params.toString()}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (upstream.status === 404) {
      return json({ error: "Conteúdo não encontrado.", code: "NOT_FOUND" }, 404, {
        "Cache-Control": "public, max-age=60",
      });
    }
    if (upstream.status === 401) {
      return json(
        { error: "A chave da TMDB configurada no servidor é inválida.", code: "INVALID_API_KEY" },
        500,
        { "Cache-Control": "no-store" }
      );
    }
    if (upstream.status === 429) {
      const retry = upstream.headers.get("retry-after") || "2";
      return json({ error: "Muitas requisições. Tente novamente em instantes.", code: "RATE_LIMITED" }, 429, {
        "Retry-After": retry,
        "Cache-Control": "no-store",
      });
    }
    if (!upstream.ok) {
      return json({ error: "A TMDB retornou um erro.", code: "UPSTREAM_ERROR" }, 502, {
        "Cache-Control": "no-store",
      });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", ...cacheHeaders(endpoint) },
    });
  } catch (err) {
    // Nunca devolver err.message/URL: poderia expor a chave presente na query.
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return json(
      {
        error: timedOut ? "A TMDB demorou demais para responder." : "Não foi possível falar com a TMDB.",
        code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
      },
      504,
      { "Cache-Control": "no-store" }
    );
  }
}

export const config = {
  path: "/api/*",
};
