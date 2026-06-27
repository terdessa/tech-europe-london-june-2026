// Flash P4 — command processor.
//
// A single entry point that applies a typed Command (see canvasTypes.ts) to the
// canvas store. Used by POST /api/canvas/[meetingId]/commands. Every command is
// validated at this boundary (CLAUDE.md: "validate at boundaries; no silent
// swallow") and every successful result carries the latest canvas snapshot.

import type { Canvas, CanvasNodeType, Command } from "./canvasTypes";
import {
  getCanvas,
  addNode,
  updateNode,
  deleteNode,
  moveNode,
  addEdge,
  deleteEdge,
} from "./canvasStore";
import { runQuery, runSummarize } from "./flashActions";

// Valid node types, mirrored from CanvasNodeType for runtime validation.
const VALID_NODE_TYPES: readonly CanvasNodeType[] = [
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

function isValidNodeType(value: unknown): value is CanvasNodeType {
  return typeof value === "string" && VALID_NODE_TYPES.includes(value as CanvasNodeType);
}

export async function processCommand(
  meetingId: string,
  command: Command,
): Promise<{ ok: boolean; canvas?: Canvas; result?: unknown; error?: string }> {
  switch (command.type) {
    case "add_node": {
      const data = command.data;
      if (!isValidNodeType(data?.nodeType)) {
        return { ok: false, error: "add_node requires a valid nodeType" };
      }
      const { node } = addNode(meetingId, data);
      return { ok: true, canvas: getCanvas(meetingId), result: node };
    }

    case "update_node": {
      const canvas = updateNode(meetingId, command.data.id, command.data.changes);
      if (!canvas) return { ok: false, error: "node not found" };
      return { ok: true, canvas };
    }

    case "delete_node": {
      const canvas = deleteNode(meetingId, command.data.id);
      if (!canvas) return { ok: false, error: "node not found" };
      return { ok: true, canvas };
    }

    case "move_node": {
      const canvas = moveNode(meetingId, command.data.id, command.data.position);
      if (!canvas) return { ok: false, error: "node not found" };
      return { ok: true, canvas };
    }

    case "add_edge": {
      const result = addEdge(meetingId, command.data);
      if (!result) return { ok: false, error: "source/target missing" };
      return { ok: true, canvas: result.canvas, result: result.edge };
    }

    case "delete_edge": {
      const canvas = deleteEdge(meetingId, command.data.id);
      if (!canvas) return { ok: false, error: "edge not found" };
      return { ok: true, canvas };
    }

    case "query": {
      const { query, k, createNodes } = command.data;
      const { chunks, canvas, error } = await runQuery(meetingId, query, k, createNodes);
      return { ok: true, canvas, result: { chunks }, error };
    }

    case "summarize": {
      const { canvas, summaryNodeId, summary, error } = await runSummarize(meetingId);
      return { ok: true, canvas, result: { summaryNodeId, summary }, error };
    }

    default:
      return { ok: false, error: "unknown command" };
  }
}
