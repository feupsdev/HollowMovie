// Notificações curtas. A região é aria-live, então leitores de tela anunciam.
import { createElement, escapeHtml } from "../utils/dom.js";

let region;

function ensureRegion() {
  if (region) return region;
  region = createElement(`<div class="toast-region" role="status" aria-live="polite" aria-atomic="false"></div>`);
  document.body.appendChild(region);
  return region;
}

/**
 * @param {string} message
 * @param {{action?: {label: string, onClick: () => void}, duration?: number}} [options]
 */
export function toast(message, { action, duration = 4500 } = {}) {
  const container = ensureRegion();
  const element = createElement(
    `<div class="toast"><span>${escapeHtml(message)}</span>${
      action ? `<button type="button" class="toast__action">${escapeHtml(action.label)}</button>` : ""
    }</div>`
  );

  const dismiss = () => {
    element.classList.add("is-leaving");
    setTimeout(() => element.remove(), 200);
  };

  element.querySelector(".toast__action")?.addEventListener("click", () => {
    action.onClick();
    dismiss();
  });

  // Limita a pilha a 3 toasts
  while (container.children.length >= 3) container.firstElementChild.remove();
  container.appendChild(element);
  setTimeout(dismiss, duration);
}
