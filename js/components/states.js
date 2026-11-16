// Estados de interface reutilizáveis: vazio, erro e carregamento.
import { html, raw } from "../utils/dom.js";
import { icon } from "../utils/icons.js";

export function emptyState({ iconName = "film", title, text = "", action = null }) {
  return html`<div class="state">
    <div class="state__icon">${raw(icon(iconName, { size: 28 }))}</div>
    <h2 class="state__title">${title}</h2>
    ${text ? html`<p class="state__text">${text}</p>` : ""}
    ${action ? html`<a class="btn btn--primary" href="${action.href}">${action.label}</a>` : ""}
  </div>`;
}

/** Mensagem de erro amigável + botão "Tentar de novo" (use `data-retry` no handler). */
export function errorState(error, { compact = false } = {}) {
  const misconfigured = error?.code === "MISSING_API_KEY" || error?.code === "INVALID_API_KEY" || error?.code === "NO_BACKEND";
  const text = misconfigured
    ? `${error.message} Consulte o README para configurar a variável TMDB_API_KEY.`
    : error?.message || "Não foi possível carregar os dados.";
  return html`<div class="state state--error ${compact ? "state--compact" : ""}" role="alert">
    <div class="state__icon">${raw(icon("triangle-alert", { size: 24 }))}</div>
    <h2 class="state__title">${misconfigured ? "Configuração pendente" : "Ops, algo falhou"}</h2>
    <p class="state__text">${text}</p>
    <button type="button" class="btn btn--ghost" data-retry>${raw(icon("refresh-cw", { size: 16 }))} Tentar de novo</button>
  </div>`;
}
