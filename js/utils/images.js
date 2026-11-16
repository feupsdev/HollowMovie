// URLs de imagens oficiais da TMDB (image.tmdb.org). Tamanhos válidos:
// poster: w92 w154 w185 w342 w500 w780 | backdrop: w300 w780 w1280 | profile: w185 h632 | logo: w92 w154
import { IMG_BASE } from "../config.js";

const url = (size, path) => (path ? `${IMG_BASE}/${size}${path}` : "");

export const posterUrl = (path, size = "w342") => url(size, path);
export const backdropUrl = (path, size = "w1280") => url(size, path);
export const profileUrl = (path, size = "w185") => url(size, path);
export const logoUrl = (path, size = "w92") => url(size, path);

export const posterSrcset = (path) =>
  path ? `${url("w185", path)} 185w, ${url("w342", path)} 342w, ${url("w500", path)} 500w` : "";

export const backdropSrcset = (path) =>
  path ? `${url("w780", path)} 780w, ${url("w1280", path)} 1280w` : "";
