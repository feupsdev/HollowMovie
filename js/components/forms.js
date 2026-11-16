// Campos de formulário reutilizados pelas páginas de filtros.
import { html, raw } from "../utils/dom.js";
import { icon } from "../utils/icons.js";

/**
 * options: [{value, label}] ou [{label, options: [...]}] (optgroup)
 */
export function selectField({ id, label, value = "", options }) {
  const renderOption = (option) =>
    html`<option value="${option.value}" ${String(option.value) === String(value) ? raw("selected") : ""}>${option.label}</option>`;
  return html`<div class="field">
    <label class="field__label" for="${id}">${label}</label>
    <div class="select">
      <select id="${id}" name="${id}">
        ${options.map((option) =>
          option.options
            ? html`<optgroup label="${option.label}">${option.options.map(renderOption)}</optgroup>`
            : renderOption(option)
        )}
      </select>
      ${raw(icon("chevron-down", { size: 16 }))}
    </div>
  </div>`;
}

export const RATING_OPTIONS = [
  { value: "", label: "Qualquer nota" },
  { value: "5", label: "5+" },
  { value: "6", label: "6+" },
  { value: "7", label: "7+" },
  { value: "8", label: "8+" },
  { value: "9", label: "9+" },
];

export function yearOptions(emptyLabel = "Todos os anos") {
  const current = new Date().getFullYear() + 1;
  const years = [{ value: "", label: emptyLabel }];
  for (let year = current; year >= 1920; year--) years.push({ value: String(year), label: String(year) });
  return years;
}
