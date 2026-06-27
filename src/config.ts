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
    embedModel: str(process.env.SUPERLINKED_EMBED_MODEL, "BAAI/bge-m3"),
    rerankModel: str(process.env.SUPERLINKED_RERANK_MODEL, "BAAI/bge-reranker-v2-m3"),
    docModel: str(process.env.SUPERLINKED_DOC_MODEL, "docling"),
  },
} as const;

export type AppConfig = typeof config;
