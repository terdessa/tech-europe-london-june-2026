import "dotenv/config";
import path from "node:path";

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: string | undefined, fallback = ""): string =>
  v === undefined || v === "" ? fallback : v;

export const config = {
  port: num(process.env.PORT, 3000),
  contextServiceUrl: str(process.env.CONTEXT_SERVICE_URL, "http://localhost:3000"),
  sqlitePath: path.resolve(str(process.env.SQLITE_PATH, "./data/retrieval.db")),
  superlinked: {
    endpoint: str(process.env.SUPERLINKED_ENDPOINT, ""),
    apiKey: str(process.env.SUPERLINKED_API_KEY, ""),
    clusterUrl: str(process.env.SUPERLINKED_CLUSTER_URL, ""),
    mode: str(process.env.SUPERLINKED_MODE, "sie") as "sie" | "framework",
    gpu: str(process.env.SUPERLINKED_GPU, "l4"),
    provisionTimeoutMs: num(process.env.SUPERLINKED_PROVISION_TIMEOUT_MS, 900_000),
    embedModel: str(
      process.env.SUPERLINKED_EMBED_MODEL,
      "sentence-transformers/all-MiniLM-L6-v2",
    ),
    rerankModel: str(
      process.env.SUPERLINKED_RERANK_MODEL,
      "cross-encoder/ms-marco-MiniLM-L-6-v2",
    ),
    docModel: str(process.env.SUPERLINKED_DOC_MODEL, "docling"),
  },
} as const;

export type AppConfig = typeof config;
