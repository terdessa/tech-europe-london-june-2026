// Local keyword baseline. Exists for two reasons:
//   1) Fallback if Superlinked credentials/endpoint are not yet wired.
//   2) Comparison baseline — proves Superlinked semantic retrieval is better
//      on paraphrased queries like "how much money is left?".
//
// NEVER make this the primary retrieval path. Superlinked is the intelligence layer.

import type { ChunkRow } from "../db.js";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "had", "has", "have", "he", "her", "his", "how", "i", "in", "is", "it",
  "its", "of", "on", "or", "our", "she", "so", "that", "the", "their",
  "them", "they", "this", "to", "was", "we", "were", "what", "when",
  "where", "which", "who", "why", "will", "with", "you", "your", "do",
  "does", "did", "can", "could", "should", "would", "about",
]);

const tokenise = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));

export type ScoredChunk = { chunkId: string; score: number };

export const keywordSearch = (
  query: string,
  candidates: ChunkRow[],
  limit: number,
): ScoredChunk[] => {
  const qTokens = tokenise(query);
  if (qTokens.length === 0) return [];
  const qSet = new Set(qTokens);
  const phrase = query.toLowerCase().trim();

  const scored: ScoredChunk[] = [];
  for (const c of candidates) {
    const text = c.text.toLowerCase();
    const docTokens = tokenise(c.text);
    if (docTokens.length === 0) continue;

    let overlap = 0;
    for (const t of docTokens) if (qSet.has(t)) overlap += 1;
    if (overlap === 0 && !text.includes(phrase)) continue;

    const phraseBonus = text.includes(phrase) ? 0.5 : 0;
    const raw = overlap / qTokens.length + phraseBonus;
    const score = Math.min(1, raw);
    scored.push({ chunkId: c.id, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};
