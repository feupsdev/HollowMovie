import test from "node:test";
import assert from "node:assert/strict";
import handler, { extractEndpoint, isAllowedPath, sanitizeParams } from "../netlify/functions/tmdb.mjs";

const req = (path, method = "GET") => new Request(`http://localhost${path}`, { method });

test("extractEndpoint aceita /api e caminho interno da função", () => {
  assert.equal(extractEndpoint("/api/movie/popular"), "/movie/popular");
  assert.equal(extractEndpoint("/.netlify/functions/tmdb/tv/1"), "/tv/1");
  assert.equal(extractEndpoint("/outra/rota"), null);
});

test("allowlist de endpoints", () => {
  for (const ok of ["/trending/all/week", "/movie/550", "/tv/1399/credits", "/movie/550/watch/providers", "/person/1/combined_credits", "/search/multi", "/discover/tv", "/genre/movie/list"])
    assert.ok(isAllowedPath(ok), ok);
  for (const bad of ["/account", "/movie/abc", "/movie/550/images/../../account", "/authentication/token/new", "/list/1", "/movie/1/rating", "//evil.com"])
    assert.ok(!isAllowedPath(bad), bad);
});

test("sanitizeParams descarta api_key e desconhecidos, rejeita valores inválidos", () => {
  const { params } = sanitizeParams(new URLSearchParams("api_key=SECRET&page=2&foo=bar&with_genres=28,12"));
  assert.equal(params.get("page"), "2");
  assert.equal(params.get("with_genres"), "28,12");
  assert.ok(!params.has("api_key") && !params.has("foo"));
  assert.ok(sanitizeParams(new URLSearchParams("page=9999")).error);
  assert.ok(sanitizeParams(new URLSearchParams("sort_by=a;b")).error);
});

test("sem TMDB_API_KEY responde 500 com código claro", async () => {
  delete process.env.TMDB_API_KEY;
  const res = await handler(req("/api/movie/popular"));
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "MISSING_API_KEY");
});

test("bloqueia método, endpoint e não vaza a chave", async () => {
  process.env.TMDB_API_KEY = "SEGREDO123";
  process.env.TMDB_API_BASE_URL = "http://127.0.0.1:1"; // porta fechada => erro de rede
  assert.equal((await handler(req("/api/movie/popular", "POST"))).status, 405);
  assert.equal((await handler(req("/api/account"))).status, 403);
  assert.equal((await handler(req("/api/movie/popular?page=x"))).status, 400);
  const res = await handler(req("/api/movie/popular"));
  assert.equal(res.status, 504);
  assert.ok(!(await res.text()).includes("SEGREDO123"));
});
