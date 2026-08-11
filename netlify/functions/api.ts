import serverless from "serverless-http";
import { createApp } from "../../src/app.js";

/**
 * Netlify Function que embrulha o mesmo app Express do worker.
 * O redirect em netlify.toml manda /health, /emit, /status, /cancel para cá,
 * preservando o path, então as rotas do Express respondem normalmente.
 *
 * Nota de plataforma: Netlify Functions (Node/Lambda) permitem mTLS de saída via
 * `https.Agent({ cert, key })` — o worker fala com o SEFIN por `https.request`,
 * não pelo `fetch` nativo (que não aceita client cert). Timeout síncrono do plano
 * free é ~10s; para emissões mais lentas prefira Cloud Run (60s) ou Railway.
 */
export const handler = serverless(createApp());
