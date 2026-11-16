#!/usr/bin/env node
/**
 * Servidor de desenvolvimento local, sem dependências.
 *
 *  - Serve os arquivos estáticos do projeto.
 *  - Roteia /api/* para a MESMA função usada no Netlify (netlify/functions/tmdb.mjs).
 *  - Faz fallback de SPA (rotas como /filme/123 devolvem index.html).
 *  - Lê variáveis de ambiente do arquivo .env (que nunca vai para o Git).
 *
 * Uso:  npm run dev   (ou: node scripts/dev-server.mjs)
 * Alternativa equivalente: npx netlify-cli dev
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 8888;

// Carrega .env (formato CHAVE=valor), sem sobrescrever variáveis já definidas.
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || line.trim().startsWith("#")) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

const { default: tmdbHandler } = await import(
  pathToFileURL(path.join(root, "netlify/functions/tmdb.mjs")).href
);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// Pastas/arquivos que não devem ser servidos como estáticos.
const BLOCKED = /^\/(\.|node_modules\/|netlify\/|scripts\/|tests\/|package(-lock)?\.json|netlify\.toml)/;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      const response = await tmdbHandler(new Request(url, { method: req.method }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    let file = path.join(root, pathname);
    const insideRoot = file.startsWith(root + path.sep) || file === root;
    const isFile = insideRoot && !BLOCKED.test(pathname) && fs.existsSync(file) && fs.statSync(file).isFile();

    if (!isFile) {
      // Asset inexistente -> 404 real; rota de SPA (inclui URLs .html legadas) -> index.html
      if (path.extname(pathname) && path.extname(pathname) !== ".html") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404");
        return;
      }
      file = path.join(root, "index.html");
    }

    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Erro interno do servidor de desenvolvimento.");
  }
});

server.listen(port, () => {
  console.log(`\n  HollowMovie em  http://localhost:${port}`);
  if (!process.env.TMDB_API_KEY) {
    console.log("  ⚠  TMDB_API_KEY não definida. Copie .env.example para .env e preencha.\n");
  } else {
    console.log("  ✓  TMDB_API_KEY carregada (somente no servidor).\n");
  }
});
