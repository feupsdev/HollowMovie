// Utilitários de DOM. O mais importante é o template `html`, que ESCAPA
// automaticamente todo valor interpolado (dados da API nunca viram HTML cru).

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

function renderValue(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHtml(value);
}

/** Marca uma string como HTML confiável (use apenas com markup gerado por nós). */
export const raw = (value) => new SafeHtml(String(value ?? ""));

/** Template literal que escapa interpolações; aninhar `html` dentro de `html` é seguro. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Delegação de eventos: handler recebe (event, elementoCorrespondente). */
export function delegate(root, eventName, selector, handler) {
  const listener = (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(eventName, listener);
  return () => root.removeEventListener(eventName, listener);
}

export function debounce(fn, wait = 300) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const isAbortError = (error) => error?.name === "AbortError";

/** Cria o elemento a partir de um markup `html` (ou string confiável). */
export function createElement(markup) {
  const template = document.createElement("template");
  template.innerHTML = String(markup).trim();
  return template.content.firstElementChild;
}

let idCounter = 0;
export const uniqueId = (prefix = "hm") => `${prefix}-${++idCounter}`;

/** Executa `callback` uma única vez quando o elemento se aproxima da viewport. */
export function whenVisible(element, callback, rootMargin = "500px") {
  if (!("IntersectionObserver" in window)) {
    callback();
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        callback();
      }
    },
    { rootMargin }
  );
  observer.observe(element);
  return () => observer.disconnect();
}
