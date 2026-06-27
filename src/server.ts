// Flash P2 — Retrieval & Context HTTP service.
// Endpoints (see ARCHITECTURE.md §3):
//   POST /ingest      — P1 ▶ P2
//   POST /sources     — P4 ▶ P2
//   GET  /retrieve    — P3 ▶ P2
//   GET  /transcript  — P3/P4 ▶ P2
//   GET  /health      — operational

import express from "express";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { createLogger } from "./logger.js";
import { describe as describeSuperlinked, isConfigured } from "./retrieval/superlinkedClient.js";
import { handleIngest } from "./routes/ingest.js";
import { handleMeetings } from "./routes/meetings.js";
import { handleRetrieve } from "./routes/retrieve.js";
import { handleSources } from "./routes/sources.js";
import { handleTranscript } from "./routes/transcript.js";

const log = createLogger("server");

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "flash-retrieval",
    superlinked: isConfigured() ? "configured" : "mock",
  });
});

app.post("/ingest", (req, res) => {
  void handleIngest(req, res);
});

app.post("/sources", (req, res) => {
  void handleSources(req, res);
});

app.get("/retrieve", (req, res) => {
  void handleRetrieve(req, res);
});

app.get("/transcript", (req, res) => {
  handleTranscript(req, res);
});

app.get("/meetings", (req, res) => {
  handleMeetings(req, res);
});

// JSON 404 — other services parse JSON, never HTML.
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "not found" });
});

// Final error handler — keeps responses JSON even on unexpected throws.
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("unhandled error", { msg });
    res.status(500).json({ ok: false, error: msg });
  },
);

const start = (): void => {
  getDb(); // initialise schema before accepting traffic
  log.info(describeSuperlinked());
  app.listen(config.port, () => {
    log.info(`P2 listening on http://localhost:${config.port}`);
    log.info(`CONTEXT_SERVICE_URL (other services should use): ${config.contextServiceUrl}`);
  });
};

start();
