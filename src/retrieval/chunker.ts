// Rough ~200-token chunker for prep docs. We approximate "token" as a whitespace word —
// good enough for hackathon. Superlinked's docling parser can also return chunks
// directly; if it does, we use those instead (see superlinkedClient.parseDocument).

const APPROX_TOKENS_PER_CHUNK = 200;
const OVERLAP_TOKENS = 25;

export const chunkText = (
  text: string,
  approxTokens: number = APPROX_TOKENS_PER_CHUNK,
  overlap: number = OVERLAP_TOKENS,
): string[] => {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return [];

  const words = trimmed.split(" ");
  if (words.length <= approxTokens) return [trimmed];

  const chunks: string[] = [];
  const stride = Math.max(1, approxTokens - overlap);
  for (let i = 0; i < words.length; i += stride) {
    const slice = words.slice(i, i + approxTokens);
    if (slice.length === 0) break;
    chunks.push(slice.join(" "));
    if (i + approxTokens >= words.length) break;
  }
  return chunks;
};
