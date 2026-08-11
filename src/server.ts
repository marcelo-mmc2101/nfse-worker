import { createApp } from "./app.js";

// Modo servidor long-running (Railway / Cloud Run / Docker).
const PORT = parseInt(process.env.PORT || "3000");
createApp().listen(PORT, () => {
  console.log(`[nfse-worker] listening on :${PORT}`);
});
