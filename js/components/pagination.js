// Paginação com links reais (<a href="?page=N">): funciona com botão Voltar,
// abre em nova aba e é navegável por teclado. O router intercepta os cliques.
import { html, raw } from "../utils/dom.js";
import { icon } from "../utils/icons.js";

/** Calcula a janela de páginas: 1 … 4 5 [6] 7 8 … 50 */
export function pageWindow(page, totalPages) {
  const pages = new Set([1, totalPages, page, page - 1, page + 1, page - 2, page + 2]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, index) => {
    if (index && p - sorted[index - 1] > 1) result.push("gap");
    result.push(p);
  });
  return result;
}

/**
 * @param {{page: number, totalPages: number, hrefFor: (page: number) => string}} options
 */
export function pagination({ page, totalPages, hrefFor }) {
  if (totalPages <= 1) return html``;
  const link = (target, label, content, disabled = false) =>
    disabled
      ? html`<span class="pager__btn is-disabled" aria-disabled="true" aria-label="${label}">${content}</span>`
      : html`<a class="pager__btn" href="${hrefFor(target)}" aria-label="${label}" rel="${target < page ? "prev" : "next"}">${content}</a>`;

  return html`<nav class="pager" aria-label="Paginação">
    ${link(page - 1, "Página anterior", raw(`${icon("chevron-left", { size: 18 })}<span class="pager__text">Anterior</span>`), page <= 1)}
    <ol class="pager__pages">
      ${pageWindow(page, totalPages).map((p) =>
        p === "gap"
          ? html`<li class="pager__gap" aria-hidden="true">…</li>`
          : html`<li>
              <a class="pager__num" href="${hrefFor(p)}" ${p === page ? raw('aria-current="page"') : ""} aria-label="Página ${p}">${p}</a>
            </li>`
      )}
    </ol>
    ${link(page + 1, "Próxima página", raw(`<span class="pager__text">Próxima</span>${icon("chevron-right", { size: 18 })}`), page >= totalPages)}
  </nav>`;
}
