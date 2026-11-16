// Persistência local (localStorage) com fallback em memória e eventos para a UI reagir.
// Favoritos, histórico e preferências guardam só o necessário para desenhar cards
// sem nova requisição à API.

import { LIMITS, STORAGE_KEYS } from "../config.js";

const fallback = new Map();

function read(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return fallback.has(key) ? fallback.get(key) : defaultValue;
  }
}

function write(key, value) {
  fallback.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado / cota: mantém só em memória */
  }
}

const emit = (name) => window.dispatchEvent(new CustomEvent(name));
const isValidEntry = (e) => e && typeof e.id === "number" && (e.mediaType === "movie" || e.mediaType === "tv");

/** Reduz um item normalizado ao mínimo que precisamos guardar. */
function slim(item) {
  return {
    id: item.id,
    mediaType: item.mediaType,
    key: `${item.mediaType}:${item.id}`,
    title: item.title,
    posterPath: item.posterPath || null,
    year: item.year || "",
    rating: item.rating || 0,
    voteCount: item.voteCount || 0,
  };
}

// ---------------------------------------------------------------------------
// Favoritos
// ---------------------------------------------------------------------------
export const favorites = {
  list() {
    const data = read(STORAGE_KEYS.favorites, []);
    return Array.isArray(data) ? data.filter(isValidEntry) : [];
  },
  has(mediaType, id) {
    return this.list().some((f) => f.mediaType === mediaType && f.id === Number(id));
  },
  count() {
    return this.list().length;
  },
  add(item) {
    if (this.has(item.mediaType, item.id)) return;
    write(STORAGE_KEYS.favorites, [{ ...slim(item), addedAt: Date.now() }, ...this.list()]);
    emit("hm:favorites");
  },
  remove(mediaType, id) {
    write(
      STORAGE_KEYS.favorites,
      this.list().filter((f) => !(f.mediaType === mediaType && f.id === Number(id)))
    );
    emit("hm:favorites");
  },
  /** Alterna e retorna o novo estado (true = agora é favorito). */
  toggle(item) {
    if (this.has(item.mediaType, item.id)) {
      this.remove(item.mediaType, item.id);
      return false;
    }
    this.add(item);
    return true;
  },
  clear() {
    write(STORAGE_KEYS.favorites, []);
    emit("hm:favorites");
  },
};

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------
export const history = {
  list(limit = LIMITS.history) {
    const data = read(STORAGE_KEYS.history, []);
    return (Array.isArray(data) ? data.filter(isValidEntry) : []).slice(0, limit);
  },
  push(item) {
    const entry = { ...slim(item), viewedAt: Date.now() };
    const rest = this.list().filter((h) => h.key !== entry.key); // mais recente sobe; sem duplicatas
    write(STORAGE_KEYS.history, [entry, ...rest].slice(0, LIMITS.history));
    emit("hm:history");
  },
  clear() {
    write(STORAGE_KEYS.history, []);
    emit("hm:history");
  },
};

// ---------------------------------------------------------------------------
// Preferências
// ---------------------------------------------------------------------------
export const DEFAULT_PREFS = {
  theme: "dark", // dark | light | system
  accent: "violet", // violet | blue | orchid
  heroAutoplay: true,
  name: "",
};

export const prefs = {
  get() {
    const stored = read(STORAGE_KEYS.prefs, {});
    return { ...DEFAULT_PREFS, ...(stored && typeof stored === "object" ? stored : {}) };
  },
  set(patch) {
    write(STORAGE_KEYS.prefs, { ...this.get(), ...patch });
    emit("hm:prefs");
  },
  reset() {
    write(STORAGE_KEYS.prefs, {});
    emit("hm:prefs");
  },
};

// ---------------------------------------------------------------------------
// Exportação / limpeza total
// ---------------------------------------------------------------------------
export function exportData() {
  return {
    app: "HollowMovie",
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: favorites.list(),
    history: history.list(),
    preferences: prefs.get(),
  };
}

export function clearAllData() {
  favorites.clear();
  history.clear();
  prefs.reset();
}

// Sincroniza abas abertas ao mesmo tempo.
window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEYS.favorites) emit("hm:favorites");
  if (event.key === STORAGE_KEYS.history) emit("hm:history");
  if (event.key === STORAGE_KEYS.prefs) emit("hm:prefs");
});
