import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { GET, POST } from "../api/tmdb.js";

// TMDB falsa: devolve o caminho e a query recebidos.
function fakeTmdb() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ url: req.url, auth: req.headers.authorization || null }));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("adaptador Vercel: rewrite __path -> endpoint TMDB, chave só no servidor", async () => {
  const server = await fakeTmdb();
  process.env.TMDB_API_KEY = "CHAVE_V3_TESTE";
  process.env.TMDB_API_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await GET(new Request("https://hollowmovie.vercel.app/api/tmdb?__path=movie%2F550%2Fvideos&page=1&api_key=x"));
    assert.equal(res.status, 200);
    const body = await res.json();
    const upstream = new URL(body.url, "http://x");
    assert.equal(upstream.pathname, "/movie/550/videos");
    assert.equal(upstream.searchParams.get("page"), "1");
    assert.equal(upstream.searchParams.get("api_key"), "CHAVE_V3_TESTE"); // cliente não injeta chave
    assert.ok(!upstream.searchParams.has("__path"));
    assert.ok(res.headers.get("Vercel-CDN-Cache-Control"));
    assert.equal(res.headers.get("Netlify-CDN-Cache-Control"), null);

    // URL pública direta (sem rewrite) também funciona
    const direct = await GET(new Request("https://hollowmovie.vercel.app/api/genre/movie/list"));
    assert.equal(new URL((await direct.json()).url, "http://x").pathname, "/genre/movie/list");

    // Endpoint fora da allowlist e método inválido continuam bloqueados
    assert.equal((await GET(new Request("https://h.app/api/tmdb?__path=account"))).status, 403);
    assert.equal((await POST(new Request("https://h.app/api/tmdb?__path=movie%2Fpopular", { method: "POST" }))).status, 405);
  } finally {
    server.close();
    delete process.env.TMDB_API_BASE_URL;
  }
});

test("vercel.json: iframe só para o portfólio, SPA fallback e sem X-Frame-Options", () => {
  const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url)));
  const all = cfg.headers.find((h) => h.source === "/(.*)").headers;
  const csp = all.find((h) => h.key === "Content-Security-Policy").value;
  assert.match(csp, /frame-ancestors https:\/\/feupsdev\.vercel\.app;/);
  assert.ok(!/frame-ancestors[^;]*\*/.test(csp));
  assert.ok(!all.some((h) => h.key.toLowerCase() === "x-frame-options"));
  const spa = cfg.rewrites.find((r) => r.destination === "/index.html");
  const re = /^\/((?!api\/).*)$/;
  assert.equal(spa.source, "/((?!api/).*)");
  for (const p of ["/filme/550", "/busca", "/favoritos", "/pages/details.html"]) assert.ok(re.test(p), p);
  assert.ok(!re.test("/api/movie/popular"));
});
