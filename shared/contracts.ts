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

// §3.10  P4 ▶ P2 — list meetings for dashboard history (additive).
export type MeetingSummaryRow = {
  meetingId: MeetingId;
  lastTs: number;
  utteranceCount: number;
};

export type MeetingsResponse = {
  meetings: MeetingSummaryRow[];
};

// ---------- Error envelope --------------------------------------------------

export type ApiError = {
  ok: false;
  error: string;
};

// ---------- P1 : Agent runtime (ears, eyes & mouth) -------------------------

// §3.1 (P1's view) One spoken/screen line, speaker-attributed. P1 ingests these.
export interface Utterance {
  meetingId: MeetingId;
  speaker: string; // participant identity / Meet caption name (e.g. "Alice")
  ts: number; // epoch seconds
  text: string;
  source?: UtteranceSource; // "live" (spoken, default) | "screen" (from /vision)
}

// §3.5  P1 ▶ P3 — live agent request/response.
export interface AgentRequest {
  meetingId: MeetingId;
  requestText: string;
}
export interface AgentResponse {
  type: "answer" | "diagram";
  text?: string; // spoken back via SLNG TTS
  diagramCode?: string; // Mermaid, rendered on the web workspace
  sources?: string[];
}

// §3.6  P3 ▶ P4 — UI events feed.
export interface UIEvent {
  kind: "agent_response";
  type: "answer" | "diagram";
  text?: string;
  diagramCode?: string;
  ts: number;
}
export interface EventsResponse {
  events: UIEvent[];
}

// §3.7  P4 ▶ P3 — post-meeting.
export interface FinalizeResponse {
  summary: string;
  decisions: string[];
  actionItems: string[];
  diagrams: string[]; // Mermaid strings
}
export interface AskRequest {
  meetingId: MeetingId;
  question: string;
}
export interface AskResponse {
  answer: string;
  sources: string[];
}

// §3.9  P1 ▶ P3 — screen-frame vision. Flash "watches" shared screens.
export interface VisionRequest {
  meetingId: MeetingId;
  imageBase64: string;
  ts: number;
  sharedBy?: string; // who is sharing, for the "X (screen)" speaker label
}
export interface VisionResponse {
  description: string; // P1 ingests this as an Utterance with source "screen"
  data?: Record<string, unknown>; // optional structured extraction
}

// §3.8  P4 launcher ▶ P1 — dispatch the bot to a Google Meet.
export interface JoinRequest {
  meetingId: MeetingId;
  meetUrl: string;
}
export interface JoinResponse {
  status: "joining" | "error";
  error?: string;
}

/** The wake phrase that flips Flash from passive to active. */
export const WAKE_PHRASE = "hey flash";
