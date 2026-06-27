// Shared HTTP/JSON contracts between Flash's services.
// Source of truth: ARCHITECTURE.md §3. Keep this file in sync with that doc.
// Other tracks (P1/P3/P4) import these types — do not break them lightly.

export type MeetingId = string;

// ---------- P2 : Retrieval & Context ----------------------------------------

// §3.1  P1 ▶ P2 — one live utterance.
// `source` is optional, defaults to "live" (spoken). Per ARCHITECTURE §3.9,
// P1 also ingests screen-frame descriptions returned by P3's /vision with
// `source: "screen"` so they're searchable alongside speech.
export type UtteranceSource = "live" | "screen";

export type IngestRequest = {
  meetingId: MeetingId;
  speaker?: string;
  ts?: number; // unix seconds (or ms — service normalises internally)
  text: string;
  source?: UtteranceSource | string;
};

export type IngestResponse = {
  ok: true;
  utteranceId: string;
  chunkId: string;
};

// §3.2  P4 ▶ P2 — prep docs/links/PDFs/images.
export type SourceItem =
  | { type: "doc"; title?: string; content: string }
  | { type: "link"; title?: string; url: string }
  | { type: "pdf"; title?: string; url?: string; path?: string }
  | { type: "image"; title?: string; url?: string; path?: string };

export type SourcesRequest = {
  meetingId: MeetingId;
  items: SourceItem[];
};

export type SourcesResponse = {
  ok: true;
  sources: Array<{
    sourceId: string;
    chunksCreated: number;
    warnings: string[];
  }>;
};

// §3.3  P3 ▶ P2 — retrieve top-k chunks for a query.
export type RetrievedChunk = {
  speaker?: string;
  ts?: number;
  text: string;
  source: "live" | "doc" | "link" | "pdf" | "image" | string;
  score: number;
};

export type RetrievalMode = "keyword" | "superlinked" | "superlinked-rerank";

export type RetrieveResponse = {
  chunks: RetrievedChunk[];
  retrievalMode?: RetrievalMode;
  latencyMs?: number;
};

// §3.4  P3/P4 ▶ P2 — full ordered transcript.
export type TranscriptResponse = {
  utterances: Array<{
    speaker?: string;
    ts: number;
    text: string;
  }>;
};

// ---------- Error envelope --------------------------------------------------

export type ApiError = {
  ok: false;
  error: string;
};
