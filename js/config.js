// Constantes públicas do front-end. NENHUMA credencial fica aqui:
// a chave da TMDB vive somente no servidor (Netlify Function).

export const APP_NAME = "HollowMovie";
export const API_BASE = "/api";
export const LOCALE = "pt-BR";
export const REGION = "BR";
export const IMG_BASE = "https://image.tmdb.org/t/p";

export const STORAGE_KEYS = {
  favorites: "hm:favorites:v1",
  history: "hm:history:v1",
  prefs: "hm:prefs:v1",
  apiCache: "hm:api:",
};

export const LIMITS = {
  history: 40,
  suggestions: 6,
  searchPages: 5, // quantas páginas da busca múltipla agregamos para filtrar/paginar
  searchPageSize: 20,
  tmdbMaxPage: 500, // limite imposto pela TMDB
};

export const POPULAR_COUNTRIES = ["BR", "US", "GB", "KR", "JP", "FR", "ES", "DE", "IT", "IN", "MX", "CA", "AR", "CN"];
export const POPULAR_LANGUAGES = ["pt", "en", "es", "ja", "ko", "fr", "it", "de", "hi", "zh"];
