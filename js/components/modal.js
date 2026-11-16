// Diálogos acessíveis baseados em <dialog> nativo (foco preso, ESC fecha, foco retorna ao gatilho).
import { createElement, escapeHtml, html, raw, isAbortError } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { getVideos } from "../services/tmdb.js";
import { detailsPath } from "../utils/format.js";

// ---------------------------------------------------------------------------
// Trailer
// ---------------------------------------------------------------------------
let trailerDialog;
let trailerBody;
let trailerTitle;
let trailerController;

function ensureTrailerDialog() {
  if (trailerDialog) return;
  trailerDialog = createElement(
    html`<dialog class="modal modal--video" aria-labelledby="trailer-title">
      <div class="modal__bar">
        <h2 class="modal__title" id="trailer-title"></h2>
        <button type="button" class="icon-btn" data-close aria-label="Fechar trailer">${raw(icon("x", { size: 20 }))}</button>
      </div>
      <div class="modal__body"></div>
    </dialog>`.toString()
  );
  trailerBody = trailerDialog.querySelector(".modal__body");
  trailerTitle = trailerDialog.querySelector(".modal__title");
  trailerDialog.addEventListener("click", (event) => {
    // clique no backdrop (o próprio <dialog>) ou no X
    if (event.target === trailerDialog || event.target.closest("[data-close]")) trailerDialog.close();
  });
  trailerDialog.addEventListener("close", () => {
    trailerController?.abort();
    trailerBody.innerHTML = ""; // remove o iframe => para o vídeo
  });
  document.body.appendChild(trailerDialog);
}

export const youtubeEmbedUrl = (key, autoplay = false) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?rel=0&modestbranding=1${autoplay ? "&autoplay=1" : ""}`;

/** Abre o trailer de um filme/série. Busca os vídeos sob demanda. */
export async function openTrailer({ mediaType, id, title }) {
  ensureTrailerDialog();
  trailerController?.abort();
  trailerController = new AbortController();
  trailerTitle.textContent = `Trailer — ${title}`;
  trailerBody.innerHTML = `<div class="modal__loading"><div class="spinner" role="status" aria-label="Carregando trailer"></div></div>`;
  if (!trailerDialog.open) trailerDialog.showModal();

  try {
    const videos = await getVideos(mediaType, id, { signal: trailerController.signal });
    if (!videos.length) {
      trailerBody.innerHTML = html`<div class="modal__empty">
        <p>O trailer deste título ainda não está disponível.</p>
        <a class="btn btn--primary" href="${detailsPath(mediaType, id)}" data-close>Ver detalhes</a>
      </div>`.toString();
      return;
    }
    trailerBody.innerHTML = html`<div class="video-frame">
      <iframe src="${youtubeEmbedUrl(videos[0].key, true)}" title="Trailer de ${title}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>
    </div>`.toString();
  } catch (error) {
    if (isAbortError(error)) return;
    trailerBody.innerHTML = `<div class="modal__empty"><p>${escapeHtml(error.message || "Não foi possível carregar o trailer.")}</p></div>`;
  }
}

// ---------------------------------------------------------------------------
// Confirmação
// ---------------------------------------------------------------------------
/** Pergunta "tem certeza?" e resolve true/false. */
export function confirmDialog({ title, text = "", confirmLabel = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    const dialog = createElement(
      html`<dialog class="modal modal--confirm" aria-labelledby="confirm-title" aria-describedby="confirm-text">
        <form method="dialog" class="modal__form">
          <h2 class="modal__title" id="confirm-title">${title}</h2>
          <p class="modal__text" id="confirm-text">${text}</p>
          <div class="modal__actions">
            <button type="submit" value="cancel" class="btn btn--ghost">Cancelar</button>
            <button type="submit" value="confirm" class="btn ${danger ? "btn--danger" : "btn--primary"}">${confirmLabel}</button>
          </div>
        </form>
      </dialog>`.toString()
    );
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "confirm");
      dialog.remove();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close("cancel");
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('[value="cancel"]').focus();
  });
}
