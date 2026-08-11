import express from "express";
import cors from "cors";
import { handleEmit } from "./routes/emit.js";
import { handleCancel } from "./routes/cancel.js";
import { handleStatus } from "./routes/status.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000");
const API_KEY = process.env.NFSE_WORKER_API_KEY || "";

app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Auth middleware
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
  res.json({ status: "ok", version: "1.0.0" });
});

app.post("/emit", handleEmit);
app.post("/cancel", handleCancel);
app.post("/status", handleStatus);

app.listen(PORT, () => {
  console.log(`[nfse-worker] listening on :${PORT}`);
});
