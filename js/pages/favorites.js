// Favoritos (localStorage): lista, filtro por tipo, ordenação e limpeza.
import { html, raw, $ } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { setMeta } from "../utils/seo.js";
import { favorites } from "../services/storage.js";
import { mediaCard } from "../components/card.js";
import { emptyState } from "../components/states.js";
import { confirmDialog } from "../components/modal.js";
import { toast } from "../components/toast.js";
import { pluralize } from "../utils/format.js";
import { buildPath } from "../router.js";

const TYPES = [
  { value: "all", label: "Tudo" },
  { value: "movie", label: "Filmes" },
  { value: "tv", label: "Séries" },
];
const SORTS = {
  recent: { label: "Adicionados recentemente", fn: (a, b) => b.addedAt - a.addedAt },
  title: { label: "Título (A–Z)", fn: (a, b) => a.title.localeCompare(b.title, "pt-BR") },
  rating: { label: "Melhor avaliação", fn: (a, b) => b.rating - a.rating },
};

export async function mount(outlet, initialCtx) {
  let ctx = initialCtx;
  setMeta({ title: "Meus favoritos", description: "Os filmes e séries que você salvou no HollowMovie.", noindex: true });

  const read = () => {
    const type = TYPES.some((t) => t.value === ctx.query.get("type")) ? ctx.query.get("type") : "all";
    const sort = SORTS[ctx.query.get("sort")] ? ctx.query.get("sort") : "recent";
    return { type, sort };
  };

  outlet.innerHTML = html`<div class="container page">
    <header class="page__header page__header--row">
      <div>
        <h1 class="page__title">Meus favoritos</h1>
        <p class="page__lead" data-count></p>
      </div>
      <button type="button" class="btn btn--ghost btn--danger-ghost" data-clear>${raw(icon("trash-2", { size: 16 }))} Limpar favoritos</button>
    </header>
    <div class="toolbar" data-toolbar></div>
    <div class="grid" data-grid></div>
  </div>`.toString();

  const countEl = $("[data-count]", outlet);
  const toolbar = $("[data-toolbar]", outlet);
  const grid = $("[data-grid]", outlet);
  const clearButton = $("[data-clear]", outlet);

  function render() {
    const { type, sort } = read();
    const all = favorites.list();
    const movies = all.filter((f) => f.mediaType === "movie").length;
    const series = all.length - movies;
    countEl.textContent = all.length ? `${pluralize(all.length, "título salvo", "títulos salvos")} · ${pluralize(movies, "filme", "filmes")} e ${pluralize(series, "série", "séries")}` : "Nada por aqui ainda.";
    clearButton.hidden = !all.length;

    if (!all.length) {
      toolbar.innerHTML = "";
      grid.innerHTML = emptyState({
        iconName: "heart",
        title: "Sua lista de favoritos está vazia",
        text: "Toque no coração de qualquer filme ou série para salvá-lo aqui. Eles ficam guardados neste navegador.",
        action: { href: "/filmes", label: "Explorar filmes" },
      }).toString();
      return;
    }

    const activeId = document.activeElement?.id;
    toolbar.innerHTML = html`
      <div class="tabs" role="group" aria-label="Tipo">
        ${TYPES.map((t) => html`<button type="button" class="tab" data-type="${t.value}" aria-pressed="${type === t.value}">${t.label}</button>`)}
      </div>
      <div class="field field--inline">
        <label class="field__label" for="fav-sort">Ordenar</label>
        <div class="select">
          <select id="fav-sort">${Object.entries(SORTS).map(([value, s]) => html`<option value="${value}" ${value === sort ? raw("selected") : ""}>${s.label}</option>`)}</select>
          ${raw(icon("chevron-down", { size: 16 }))}
        </div>
      </div>`.toString();
    if (activeId) document.getElementById(activeId)?.focus();

    const list = all.filter((f) => type === "all" || f.mediaType === type).sort(SORTS[sort].fn);
    grid.innerHTML = list.length
      ? list.map((item) => mediaCard(item, { showType: true })).join("")
      : emptyState({ iconName: "film", title: "Nada nesta categoria", text: "Você ainda não favoritou títulos deste tipo." }).toString();
  }

  const onClick = (event) => {
    const tab = event.target.closest("[data-type]");
    if (tab) ctx.navigate(buildPath("/favoritos", { type: tab.dataset.type === "all" ? "" : tab.dataset.type, sort: read().sort === "recent" ? "" : read().sort }), { replace: true });
  };
  const onChange = (event) => {
    if (event.target.id === "fav-sort") {
      ctx.navigate(buildPath("/favoritos", { type: read().type === "all" ? "" : read().type, sort: event.target.value === "recent" ? "" : event.target.value }), { replace: true });
    }
  };
  toolbar.addEventListener("click", onClick);
  toolbar.addEventListener("change", onChange);

  clearButton.addEventListener("click", async () => {
    const snapshot = favorites.list();
    const ok = await confirmDialog({
      title: "Limpar todos os favoritos?",
      text: `Você vai remover ${pluralize(snapshot.length, "título", "títulos")} da sua lista.`,
      confirmLabel: "Limpar favoritos",
      danger: true,
    });
    if (!ok) return;
    favorites.clear();
    toast("Favoritos removidos.", {
      action: { label: "Desfazer", onClick: () => [...snapshot].reverse().forEach((item) => favorites.add({ ...item, key: `${item.mediaType}:${item.id}` })) },
    });
  });

  window.addEventListener("hm:favorites", render);
  render();

  return {
    update(newCtx) {
      ctx = newCtx;
      render();
    },
    destroy() {
      window.removeEventListener("hm:favorites", render);
    },
  };
}
