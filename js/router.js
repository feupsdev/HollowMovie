// Router minimalista baseado na History API.
//  - Cada rota carrega seu módulo sob demanda (import dinâmico => menos JS inicial).
//  - Páginas exportam `mount(outlet, ctx)` e podem devolver { update(ctx), destroy() }.
//    Se a navegação cai na MESMA rota (ex.: mudar um filtro), chamamos `update`
//    em vez de remontar a página inteira.
//  - ctx.signal é abortado ao sair da rota/atualizar: cancela requisições pendentes.

import { isAbortError } from "./utils/dom.js";
import { setMeta, setStructuredData } from "./utils/seo.js";

const routes = [
  { name: "home", pattern: /^\/$/, load: () => import("./pages/home.js") },
  { name: "movies", pattern: /^\/filmes\/?$/, load: () => import("./pages/browse.js"), data: { mediaType: "movie" } },
  { name: "series", pattern: /^\/series\/?$/, load: () => import("./pages/browse.js"), data: { mediaType: "tv" } },
  { name: "search", pattern: /^\/busca\/?$/, load: () => import("./pages/search.js") },
  { name: "movie", pattern: /^\/filme\/(\d+)(?:-[^/]*)?\/?$/, load: () => import("./pages/details.js"), data: { mediaType: "movie" }, keys: ["id"] },
  { name: "tv", pattern: /^\/serie\/(\d+)(?:-[^/]*)?\/?$/, load: () => import("./pages/details.js"), data: { mediaType: "tv" }, keys: ["id"] },
  { name: "person", pattern: /^\/pessoa\/(\d+)(?:-[^/]*)?\/?$/, load: () => import("./pages/person.js"), keys: ["id"] },
  { name: "favorites", pattern: /^\/favoritos\/?$/, load: () => import("./pages/favorites.js") },
  { name: "profile", pattern: /^\/perfil\/?$/, load: () => import("./pages/profile.js") },
];

const notFoundRoute = { name: "notfound", load: () => import("./pages/not-found.js") };

let outlet;
let current = null; // { route, instance, controller }
let navToken = 0;
let historyKey = 0;

const scrollPositions = new Map();

/** Compatibilidade com URLs do HollowMovie antigo. */
function migrateLegacyUrl(url) {
  if (url.pathname.endsWith("/pages/details.html")) {
    const id = url.searchParams.get("id");
    const type = url.searchParams.get("type") === "tv" ? "serie" : "filme";
    if (id && /^\d+$/.test(id)) return `/${type}/${id}`;
    return "/";
  }
  if (url.pathname === "/" && url.searchParams.has("tipo")) {
    const tipo = url.searchParams.get("tipo");
    if (tipo === "filmes") return "/filmes";
    if (tipo === "series") return "/series";
  }
  return null;
}

function matchRoute(pathname) {
  for (const route of routes) {
    const match = pathname.match(route.pattern);
    if (match) {
      const params = { ...(route.data || {}) };
      (route.keys || []).forEach((key, index) => (params[key] = match[index + 1]));
      return { route, params };
    }
  }
  return { route: notFoundRoute, params: {} };
}

/** Monta uma URL interna descartando parâmetros vazios. */
export function buildPath(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) continue;
    query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

export function navigate(to, { replace = false } = {}) {
  const url = new URL(to, window.location.origin);
  if (url.origin !== window.location.origin) {
    window.location.href = to;
    return Promise.resolve();
  }
  const target = url.pathname + url.search;
  if (replace) history.replaceState({ key: history.state?.key ?? ++historyKey }, "", target);
  else {
    saveScroll();
    history.pushState({ key: ++historyKey }, "", target);
  }
  return render({ scroll: replace ? "keep" : "top" });
}

function saveScroll() {
  if (history.state?.key !== undefined) scrollPositions.set(history.state.key, window.scrollY);
}

function setHeaderMode(mode) {
  document.body.dataset.header = mode;
}

async function render({ scroll = "top" } = {}) {
  const token = ++navToken;
  const url = new URL(window.location.href);

  const legacy = migrateLegacyUrl(url);
  if (legacy) {
    history.replaceState({ key: ++historyKey }, "", legacy);
    return render({ scroll });
  }

  const { route, params } = matchRoute(url.pathname);
  const sameRoute = current && current.route === route && current.params.id === params.id && current.instance?.update;

  current?.controller.abort();
  const controller = new AbortController();

  const ctx = {
    params,
    query: url.searchParams,
    path: url.pathname,
    signal: controller.signal,
    navigate,
    setHeader: setHeaderMode,
    route: route.name,
  };

  try {
    if (sameRoute) {
      current.controller = controller;
      await current.instance.update(ctx);
      window.dispatchEvent(new CustomEvent("hm:route", { detail: ctx }));
      return;
    }

    await current?.instance?.destroy?.();
    outlet.replaceChildren();
    outlet.removeAttribute("aria-busy");
    setHeaderMode("solid");
    setMeta({}); // reseta para o padrão; a página sobrescreve ao montar
    setStructuredData(null);

    const module = await route.load();
    if (token !== navToken) return; // outra navegação começou enquanto carregava o módulo

    current = { route, params, instance: null, controller };
    window.dispatchEvent(new CustomEvent("hm:route", { detail: ctx }));
    outlet.classList.remove("page-enter");
    void outlet.offsetWidth; // reinicia a animação de entrada
    outlet.classList.add("page-enter");

    current.instance = (await module.mount(outlet, ctx)) || {};
    if (token !== navToken) return;

    if (scroll === "top") window.scrollTo(0, 0);
    else if (scroll === "restore") window.scrollTo(0, scrollPositions.get(history.state?.key) ?? 0);

    focusMain();
  } catch (error) {
    if (isAbortError(error) || token !== navToken) return;
    console.error(error);
    outlet.innerHTML = `<div class="state state--error container" role="alert"><h1>Algo deu errado</h1><p>Não foi possível exibir esta página.</p><a class="btn btn--primary" href="/">Voltar ao início</a></div>`;
  }
}

function focusMain() {
  outlet.focus({ preventScroll: true });
  const announcer = document.getElementById("route-announcer");
  if (announcer) announcer.textContent = document.title;
}

function onClick(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor || anchor.target || anchor.hasAttribute("download") || anchor.dataset.external !== undefined) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return; // âncora
  if (/\.[a-z0-9]+$/i.test(url.pathname) && !url.pathname.endsWith("/pages/details.html")) return; // arquivo estático
  event.preventDefault();
  navigate(url.pathname + url.search);
}

export function startRouter(outletElement) {
  outlet = outletElement;
  history.scrollRestoration = "manual";
  history.replaceState({ key: ++historyKey }, "");
  document.addEventListener("click", onClick);
  window.addEventListener("popstate", () => {
    render({ scroll: "restore" });
  });
  window.addEventListener("pagehide", saveScroll);
  return render({ scroll: "keep" });
}

/** Atualiza a URL sem remontar nem navegar (ex.: refletir filtros). */
export function replaceQuery(path, params) {
  history.replaceState(history.state, "", buildPath(path, params));
}
