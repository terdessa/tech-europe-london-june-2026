// Rahid — shared contracts (the seams between tracks).
// Mirrors ARCHITECTURE.md §3. FROZEN: agree changes with the team before editing.
// These are interface schemas, not real data.

/** Correlation key for one meeting session. */
export type MeetingId = string;

/** One spoken line, speaker-attributed (P1 -> P2 /ingest, §3.1). */
export interface Utterance {
  meetingId: MeetingId;
  speaker: string; // participant identity / Meet caption name
  ts: number; // epoch seconds
  text: string;
}

/** A prep document or link added before the meeting (P4 -> P2 /sources, §3.2). */
export interface SourceItem {
  type: "doc" | "link";
  title: string;
  content?: string; // for type "doc"
  url?: string; // for type "link"
}
export interface SourcesRequest {
  meetingId: MeetingId;
  items: SourceItem[];
}

/** A retrieved context chunk (P2 /retrieve -> P3, §3.3). */
export interface RetrieveChunk {
  speaker: string;
  ts: number;
  text: string;
  source: string; // e.g. "live" | "doc: Q3 plan"
  score: number;
}
export interface RetrieveResponse {
  chunks: RetrieveChunk[];
}

/** Full ordered transcript (P2 /transcript, §3.4). */
export interface TranscriptResponse {
  utterances: Utterance[];
}

/** Live agent request/response (P1 -> P3 /agent, §3.5). */
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

/** UI events feed (P3 -> P4 /events, §3.6). */
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

/** Post-meeting (P4 -> P3, §3.7). */
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

/** Dispatch the bot to a Google Meet (P4 launcher -> P1 /join, §3.8). */
export interface JoinRequest {
  meetingId: MeetingId;
  meetUrl: string;
}
export interface JoinResponse {
  status: "joining" | "error";
  error?: string;
}

/** The wake phrase that flips Rahid from passive to active. */
export const WAKE_PHRASE = "hey rahid";
