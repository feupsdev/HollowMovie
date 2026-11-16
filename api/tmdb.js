/**
 * Adaptador Vercel Functions para o proxy da TMDB.
 *
 * A lógica (allowlist de endpoints/parâmetros, chave TMDB_API_KEY só no
 * servidor, tratamento de erros e cache) é a MESMA usada no Netlify:
 * netlify/functions/tmdb.mjs. Aqui apenas traduzimos a URL.
 *
 * O vercel.json reescreve  /api/<endpoint>?<query>  ->  /api/tmdb?__path=<endpoint>&<query>
 * Este arquivo reconstrói a URL pública (/api/<endpoint>) e chama o handler.
 */
import tmdbHandler from "../netlify/functions/tmdb.mjs";

export async function GET(request) {
  const url = new URL(request.url);

  // Endpoint original: vem do rewrite (__path) ou, se a plataforma já
  // entregar a URL pública, do próprio pathname.
  let endpoint = url.searchParams.get("__path");
  url.searchParams.delete("__path");
  if (endpoint === null) {
    endpoint = url.pathname.replace(/^\/api\/?/, "");
  }

  const publicUrl = new URL(`/api/${endpoint.replace(/^\/+/, "")}`, url.origin);
  publicUrl.search = url.search;

  const response = await tmdbHandler(new Request(publicUrl, { method: "GET", headers: request.headers }));

  // Equivalente Vercel do cache de CDN configurado para o Netlify.
  const cdn = response.headers.get("Netlify-CDN-Cache-Control");
  if (cdn) {
    const headers = new Headers(response.headers);
    headers.set("Vercel-CDN-Cache-Control", cdn);
    headers.delete("Netlify-CDN-Cache-Control");
    headers.delete("Netlify-Vary");
    return new Response(response.body, { status: response.status, headers });
  }
  return response;
}

// Qualquer outro método recebe o mesmo 405 do handler original.
const notAllowed = (request) => tmdbHandler(request);
export { notAllowed as POST, notAllowed as PUT, notAllowed as PATCH, notAllowed as DELETE };
