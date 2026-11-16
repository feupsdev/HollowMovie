// Atualiza título e metatags a cada rota (SEO básico + compartilhamento).
import { APP_NAME } from "../config.js";

const DEFAULT_DESCRIPTION =
  "HollowMovie: descubra filmes e séries em alta, pesquise com filtros, salve favoritos e veja onde assistir no Brasil.";

function setMetaTag(selector, attribute, value) {
  const element = document.head.querySelector(selector);
  if (element) element.setAttribute(attribute, value);
}

/**
 * @param {{title?: string, description?: string, image?: string, noindex?: boolean}} meta
 */
export function setMeta({ title, description, image, noindex = false } = {}) {
  const fullTitle = title ? `${title} • ${APP_NAME}` : `${APP_NAME} — Filmes e séries para descobrir`;
  const desc = (description || DEFAULT_DESCRIPTION).replace(/\s+/g, " ").trim().slice(0, 200);
  const url = window.location.origin + window.location.pathname;
  const picture = image || `${window.location.origin}/assets/img/og-cover.png`;

  document.title = fullTitle;
  setMetaTag('meta[name="description"]', "content", desc);
  setMetaTag('link[rel="canonical"]', "href", url);
  setMetaTag('meta[property="og:title"]', "content", fullTitle);
  setMetaTag('meta[property="og:description"]', "content", desc);
  setMetaTag('meta[property="og:url"]', "content", url);
  setMetaTag('meta[property="og:image"]', "content", picture);
  setMetaTag('meta[name="twitter:title"]', "content", fullTitle);
  setMetaTag('meta[name="twitter:description"]', "content", desc);
  setMetaTag('meta[name="twitter:image"]', "content", picture);
  setMetaTag('meta[name="robots"]', "content", noindex ? "noindex, follow" : "index, follow");
}

/** Dados estruturados (JSON-LD) por página, ex.: Movie/TVSeries. Substitui o anterior. */
export function setStructuredData(data) {
  let script = document.getElementById("page-jsonld");
  if (!data) {
    script?.remove();
    return;
  }
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "page-jsonld";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}
