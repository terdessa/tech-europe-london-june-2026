// Flash P4 — canvas domain types.
// The canvas is an API-managed React Flow graph that mirrors meeting memory.
// See p4-plan.md "Node Types" / "Edge Types" and ARCHITECTURE.md §3.

export type MeetingId = string;

export type CanvasNodeType =
  | "speaker"
  | "utterance"
  | "chat_context"
  | "document"
  | "image"
  | "link"
  | "topic"
  | "question"
  | "flash_answer"
  | "diagram"
  | "decision"
  | "action_item"
  | "summary"
  | "source"
  | "memory_chunk";

export type CanvasEdgeType =
  | "said"
  | "shared"
  | "mentions"
  | "answers"
  | "generated"
  | "cites"
  | "summarizes"
  | "decided_from"
  | "assigned_to"
  | "follows"
  | "derived_from";

// Runtime lists (single source of truth for validation + UI dropdowns).
export const CANVAS_NODE_TYPES: CanvasNodeType[] = [
  "speaker",
  "utterance",
  "chat_context",
  "document",
  "image",
  "link",
  "topic",
  "question",
  "flash_answer",
  "diagram",
  "decision",
  "action_item",
  "summary",
  "source",
  "memory_chunk",
];

export const CANVAS_EDGE_TYPES: CanvasEdgeType[] = [
  "said",
  "shared",
  "mentions",
  "answers",
  "generated",
  "cites",
  "summarizes",
  "decided_from",
  "assigned_to",
  "follows",
  "derived_from",
];

export type XYPosition = { x: number; y: number };

// React Flow uses a single custom node renderer keyed by `type: "flash"`.
// The domain node type lives in `data.nodeType` so we can colour/shape per kind.
export type FlashNodeData = {
  nodeType: CanvasNodeType;
  label: string;
  detail?: string;
  speaker?: string;
  ts?: number;
  source?: string; // "live" | "screen" | "doc" | "canvas" | ...
  score?: number;
  url?: string;
  diagramCode?: string; // Mermaid, for diagram nodes
  sources?: string[]; // citation strings from P3
  // free-form metadata (kept JSON-serialisable)
  meta?: Record<string, unknown>;
};

export type FlashNode = {
  id: string;
  type: "flash";
  position: XYPosition;
  data: FlashNodeData;
};

export type FlashEdge = {
  id: string;
  source: string;
  target: string;
  type: "flash";
  label?: string;
  data: { edgeType: CanvasEdgeType };
};

export type Canvas = {
  meetingId: MeetingId;
  version: number;
  nodes: FlashNode[];
  edges: FlashEdge[];
  updatedAt: number;
};

// ---- API payloads ---------------------------------------------------------

export type AddNodeInput = {
  nodeType: CanvasNodeType;
  label: string;
  detail?: string;
  position?: XYPosition;
  data?: Partial<FlashNodeData>;
  id?: string;
};

export type UpdateNodeInput = {
  label?: string;
  detail?: string;
  position?: XYPosition;
  nodeType?: CanvasNodeType;
  data?: Partial<FlashNodeData>;
};

export type AddEdgeInput = {
  source: string;
  target: string;
  edgeType: CanvasEdgeType;
  label?: string;
  id?: string;
};

// Events pushed in from P1/P3 (or the UI) that mutate the graph.
// Passive kinds only create memory/context — they never trigger a Flash answer.
export type CanvasEvent =
  | { kind: "utterance"; speaker?: string; text: string; ts?: number; source?: string }
  | { kind: "chat"; speaker?: string; text: string; ts?: number; mentions?: string[] }
  | { kind: "document"; title?: string; content?: string; url?: string; ts?: number }
  | { kind: "link"; title?: string; url: string; ts?: number }
  | { kind: "image"; title?: string; caption?: string; url?: string; ts?: number }
  // ACTIVE — only these produce a Flash answer:
  | { kind: "manual_prompt"; text: string; speaker?: string; ts?: number }
  | {
      kind: "agent_response";
      type: "answer" | "diagram";
      text?: string;
      diagramCode?: string;
      sources?: string[];
      questionNodeId?: string;
      ts?: number;
    }
  | {
      kind: "finalize";
      summary?: string;
      decisions?: string[];
      actionItems?: string[];
      diagrams?: string[];
      ts?: number;
    }
  | { kind: "summary"; text: string; sourceNodeIds?: string[]; ts?: number };

export type CommandType =
  | "add_node"
  | "update_node"
  | "delete_node"
  | "move_node"
  | "add_edge"
  | "delete_edge"
  | "query"
  | "summarize";

export type Command =
  | { type: "add_node"; data: AddNodeInput }
  | { type: "update_node"; data: { id: string; changes: UpdateNodeInput } }
  | { type: "delete_node"; data: { id: string } }
  | { type: "move_node"; data: { id: string; position: XYPosition } }
  | { type: "add_edge"; data: AddEdgeInput }
  | { type: "delete_edge"; data: { id: string } }
  | { type: "query"; data: { query: string; k?: number; createNodes?: boolean } }
  | { type: "summarize"; data?: Record<string, never> };

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string };
