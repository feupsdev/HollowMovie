import { html } from "../utils/dom.js";
import { setMeta } from "../utils/seo.js";
import { emptyState } from "../components/states.js";

export function mount(outlet) {
  setMeta({ title: "Página não encontrada", noindex: true });
  outlet.innerHTML = html`<div class="container page">${emptyState({
    iconName: "clapperboard",
    title: "Corta! Essa página não existe",
    text: "O endereço pode ter mudado ou nunca ter existido. Que tal voltar para o início?",
    action: { href: "/", label: "Ir para o início" },
  })}</div>`.toString();
}
