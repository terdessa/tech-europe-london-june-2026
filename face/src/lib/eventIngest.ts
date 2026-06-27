// Converts inbound events into canvas nodes/edges.
//
// CORE FLASH RULE (p4-plan.md "Flash behavior"):
//   Passive events (utterance / chat / document / link / image) only create
//   MEMORY / CONTEXT nodes. They NEVER trigger a Flash answer.
//   Flash answers come only from manual_prompt / agent_response / commands.

import {
  addEdge,
  addNode,
  getCanvas,
} from "./canvasStore";
import type {
  CanvasEdgeType,
  CanvasNodeType,
  FlashNode,
  MeetingId,
} from "./canvasTypes";

function link(meetingId: MeetingId, source: string, target: string, edgeType: CanvasEdgeType) {
  addEdge(meetingId, { source, target, edgeType });
}

function speakerNode(meetingId: MeetingId, name: string): FlashNode {
  const canvas = getCanvas(meetingId);
  const existing = canvas?.nodes.find(
    (n) => n.data.nodeType === "speaker" && n.data.label === name,
  );
  if (existing) return existing;
  return addNode(meetingId, { nodeType: "speaker", label: name, detail: "Participant" }).node;
}

function truncate(text: string, max = 120): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ---- Passive (memory/context only) ---------------------------------------

export function ingestUtterance(
  meetingId: MeetingId,
  e: { speaker?: string; text: string; ts?: number; source?: string },
): string {
  const speaker = speakerNode(meetingId, e.speaker ?? "Speaker");
  const utt = addNode(meetingId, {
    nodeType: "utterance",
    label: truncate(e.text),
    detail: e.text,
    data: { speaker: e.speaker, ts: e.ts, source: e.source ?? "live" },
  }).node;
  link(meetingId, speaker.id, utt.id, "said");
  return utt.id;
}

export function ingestChat(
  meetingId: MeetingId,
  e: { speaker?: string; text: string; ts?: number; mentions?: string[] },
): string {
  const speaker = speakerNode(meetingId, e.speaker ?? "Chat");
  const chat = addNode(meetingId, {
    nodeType: "chat_context",
    label: truncate(e.text),
    detail: e.text,
    data: { speaker: e.speaker, ts: e.ts, source: "chat" },
  }).node;
  link(meetingId, speaker.id, chat.id, "shared");
  for (const mentioned of e.mentions ?? []) {
    const target = speakerNode(meetingId, mentioned);
    link(meetingId, chat.id, target.id, "mentions");
  }
  return chat.id;
}

export function ingestSource(
  meetingId: MeetingId,
  nodeType: Extract<CanvasNodeType, "document" | "link" | "image">,
  e: { title?: string; content?: string; caption?: string; url?: string; ts?: number },
): string {
  const label = e.title ?? e.caption ?? e.url ?? nodeType;
  const node = addNode(meetingId, {
    nodeType,
    label: truncate(label, 80),
    detail: e.content ?? e.caption ?? e.url,
    data: { url: e.url, ts: e.ts, source: nodeType },
  }).node;
  // A discrete "source" handle that citations can point at.
  const src = addNode(meetingId, {
    nodeType: "source",
    label: truncate(label, 60),
    detail: e.url ?? e.content,
    data: { url: e.url, source: nodeType },
  }).node;
  link(meetingId, node.id, src.id, "derived_from");
  return node.id;
}

// ---- Active (Flash answers) ----------------------------------------------

export function createQuestionNode(
  meetingId: MeetingId,
  text: string,
  speaker?: string,
  ts?: number,
): string {
  const q = addNode(meetingId, {
    nodeType: "question",
    label: truncate(text, 100),
    detail: text,
    data: { speaker, ts, source: "manual" },
  }).node;
  if (speaker) {
    const sp = speakerNode(meetingId, speaker);
    link(meetingId, sp.id, q.id, "said");
  }
  return q.id;
}

// Turn a P3 agent_response into flash_answer (+ optional diagram) nodes.
export function applyAgentResponse(
  meetingId: MeetingId,
  e: {
    type: "answer" | "diagram";
    text?: string;
    diagramCode?: string;
    sources?: string[];
    questionNodeId?: string;
    ts?: number;
  },
): { answerNodeId: string; diagramNodeId?: string } {
  const answer = addNode(meetingId, {
    nodeType: "flash_answer",
    label: truncate(e.text ?? "Flash answered", 140),
    detail: e.text,
    data: { ts: e.ts, sources: e.sources, source: "flash" },
  }).node;

  if (e.questionNodeId && getCanvas(meetingId)?.nodes.some((n) => n.id === e.questionNodeId)) {
    link(meetingId, answer.id, e.questionNodeId, "answers");
  }
  citeSources(meetingId, answer.id, e.sources);

  let diagramNodeId: string | undefined;
  if (e.type === "diagram" && e.diagramCode) {
    const diagram = addNode(meetingId, {
      nodeType: "diagram",
      label: truncate(e.text ?? "Diagram", 80),
      detail: e.text,
      data: { diagramCode: e.diagramCode, ts: e.ts, sources: e.sources, source: "flash" },
    }).node;
    link(meetingId, answer.id, diagram.id, "generated");
    citeSources(meetingId, diagram.id, e.sources);
    diagramNodeId = diagram.id;
  }
  return { answerNodeId: answer.id, diagramNodeId };
}

// Best-effort: link an answer/diagram to existing source-ish nodes by matching
// the citation string against node labels; otherwise drop a memory_chunk node.
function citeSources(meetingId: MeetingId, fromId: string, sources?: string[]) {
  if (!sources?.length) return;
  for (const s of sources) {
    const canvas = getCanvas(meetingId);
    const match = canvas?.nodes.find(
      (n) =>
        n.id !== fromId &&
        (n.data.nodeType === "source" ||
          n.data.nodeType === "document" ||
          n.data.nodeType === "memory_chunk" ||
          n.data.nodeType === "utterance") &&
        n.data.label.toLowerCase().includes(s.toLowerCase().slice(0, 12)),
    );
    if (match) {
      link(meetingId, fromId, match.id, "cites");
    } else {
      const chunk = addNode(meetingId, {
        nodeType: "memory_chunk",
        label: truncate(s, 60),
        detail: s,
        data: { source: "canvas" },
      }).node;
      link(meetingId, fromId, chunk.id, "cites");
    }
  }
}

// ---- Finalize / summary ---------------------------------------------------

export function applyFinalize(
  meetingId: MeetingId,
  e: { summary?: string; decisions?: string[]; actionItems?: string[]; diagrams?: string[]; ts?: number },
): { summaryNodeId?: string } {
  let summaryNodeId: string | undefined;
  if (e.summary) {
    summaryNodeId = createSummaryNode(meetingId, e.summary, e.ts);
  }
  for (const d of e.decisions ?? []) {
    const node = addNode(meetingId, {
      nodeType: "decision",
      label: truncate(d, 90),
      detail: d,
      data: { ts: e.ts, source: "flash" },
    }).node;
    if (summaryNodeId) link(meetingId, summaryNodeId, node.id, "decided_from");
  }
  for (const a of e.actionItems ?? []) {
    const node = addNode(meetingId, {
      nodeType: "action_item",
      label: truncate(a, 90),
      detail: a,
      data: { ts: e.ts, source: "flash" },
    }).node;
    if (summaryNodeId) link(meetingId, summaryNodeId, node.id, "assigned_to");
  }
  for (const code of e.diagrams ?? []) {
    const node = addNode(meetingId, {
      nodeType: "diagram",
      label: "Summary diagram",
      data: { diagramCode: code, ts: e.ts, source: "flash" },
    }).node;
    if (summaryNodeId) link(meetingId, summaryNodeId, node.id, "generated");
  }
  return { summaryNodeId };
}

export function createSummaryNode(
  meetingId: MeetingId,
  text: string,
  ts?: number,
  sourceNodeIds?: string[],
): string {
  const summary = addNode(meetingId, {
    nodeType: "summary",
    label: truncate(text, 140),
    detail: text,
    data: { ts, source: "flash" },
  }).node;
  for (const id of sourceNodeIds ?? []) {
    if (getCanvas(meetingId)?.nodes.some((n) => n.id === id)) {
      link(meetingId, summary.id, id, "summarizes");
    }
  }
  return summary.id;
}
