import express from "express";
import cors from "cors";
import { handleEmit } from "./routes/emit.js";
import { handleCancel } from "./routes/cancel.js";
import { handleStatus } from "./routes/status.js";

/**
 * O app Express, sem `listen`. Assim a mesma lógica serve dois modos de deploy:
 *  - servidor long-running (Railway / Cloud Run / Docker): `server.ts` chama `app.listen`.
 *  - serverless sob demanda (Netlify Functions): `netlify/functions/api.ts` embrulha este app.
 */
export function createApp() {
  const app = express();
  const API_KEY = process.env.NFSE_WORKER_API_KEY || "";

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  // Auth: /health é público; o resto exige X-API-Key. Sem chave setada, recusa tudo (fail-closed).
  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    if (!API_KEY) {
      console.error("[auth] NFSE_WORKER_API_KEY not set — rejecting all requests");
      return res.status(500).json({ error: "Server misconfigured: API key not set" });
    }
    const key = req.headers["x-api-key"] || req.headers.authorization?.replace("Bearer ", "");
    if (key === API_KEY) return next();
    res.status(401).json({ error: "Unauthorized" });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "1.1.0" });
  });

  app.post("/emit", handleEmit);
  app.post("/cancel", handleCancel);
  app.post("/status", handleStatus);

  return app;
}
