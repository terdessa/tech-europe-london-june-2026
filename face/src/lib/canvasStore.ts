// In-memory canvas store (one graph per meetingId).
//
// Per p4-plan.md "Assumptions": P4's graph is *demo state*; P2 is the durable
// memory/RAG store. So a process-local map is intentional. All mutations are
// immutable — they return a NEW Canvas and replace the map entry (CLAUDE.md:
// "never mutate shared state objects — return new copies").
//
// Next dev/prod keeps module state alive across requests in the same process,
// which is all we need for the demo. globalThis caching survives HMR in dev.

import type {
  AddEdgeInput,
  AddNodeInput,
  Canvas,
  FlashEdge,
  FlashNode,
  MeetingId,
  UpdateNodeInput,
  XYPosition,
} from "./canvasTypes";
import { newEdgeId, newNodeId } from "./ids";
import { positionFor } from "./layout";

type Store = Map<MeetingId, Canvas>;

const g = globalThis as unknown as { __flashCanvasStore?: Store };
const store: Store = g.__flashCanvasStore ?? (g.__flashCanvasStore = new Map());

function bump(canvas: Canvas, patch: Partial<Canvas>): Canvas {
  const next: Canvas = {
    ...canvas,
    ...patch,
    version: canvas.version + 1,
    updatedAt: now(),
  };
  store.set(next.meetingId, next);
  return next;
}

// Module-local clock that never goes backwards. We can't call Date.now() in some
// sandboxed contexts, so derive a stamp from a counter seeded once.
let clock = 1_700_000_000;
function now(): number {
  clock += 1;
  return clock;
}

export function getCanvas(meetingId: MeetingId): Canvas | undefined {
  return store.get(meetingId);
}

export function ensureCanvas(meetingId: MeetingId): Canvas {
  const existing = store.get(meetingId);
  if (existing) return existing;
  const fresh: Canvas = {
    meetingId,
    version: 0,
    nodes: [],
    edges: [],
    updatedAt: now(),
  };
  store.set(meetingId, fresh);
  return fresh;
}

export function replaceCanvas(
  meetingId: MeetingId,
  nodes: FlashNode[],
  edges: FlashEdge[],
): Canvas {
  const canvas = ensureCanvas(meetingId);
  return bump(canvas, { nodes, edges });
}

export function addNode(meetingId: MeetingId, input: AddNodeInput): { canvas: Canvas; node: FlashNode } {
  const canvas = ensureCanvas(meetingId);
  const node: FlashNode = {
    id: input.id ?? newNodeId(input.nodeType),
    type: "flash",
    position: input.position ?? positionFor(canvas, input.nodeType),
    data: {
      nodeType: input.nodeType,
      label: input.label,
      detail: input.detail,
      ...input.data,
    },
  };
  const next = bump(canvas, { nodes: [...canvas.nodes, node] });
  return { canvas: next, node };
}

export function updateNode(
  meetingId: MeetingId,
  id: string,
  changes: UpdateNodeInput,
): Canvas | undefined {
  const canvas = getCanvas(meetingId);
  if (!canvas) return undefined;
  if (!canvas.nodes.some((n) => n.id === id)) return undefined;
  const nodes = canvas.nodes.map((n) =>
    n.id === id
      ? {
          ...n,
          position: changes.position ?? n.position,
          data: {
            ...n.data,
            ...(changes.data ?? {}),
            nodeType: changes.nodeType ?? n.data.nodeType,
            label: changes.label ?? n.data.label,
            detail: changes.detail ?? n.data.detail,
          },
        }
      : n,
  );
  return bump(canvas, { nodes });
}

export function moveNode(
  meetingId: MeetingId,
  id: string,
  position: XYPosition,
): Canvas | undefined {
  return updateNode(meetingId, id, { position });
}

export function deleteNode(meetingId: MeetingId, id: string): Canvas | undefined {
  const canvas = getCanvas(meetingId);
  if (!canvas) return undefined;
  const nodes = canvas.nodes.filter((n) => n.id !== id);
  const edges = canvas.edges.filter((e) => e.source !== id && e.target !== id);
  return bump(canvas, { nodes, edges });
}

export function addEdge(meetingId: MeetingId, input: AddEdgeInput): { canvas: Canvas; edge: FlashEdge } | undefined {
  const canvas = ensureCanvas(meetingId);
  const hasSource = canvas.nodes.some((n) => n.id === input.source);
  const hasTarget = canvas.nodes.some((n) => n.id === input.target);
  if (!hasSource || !hasTarget) return undefined;
  const edge: FlashEdge = {
    id: input.id ?? newEdgeId(),
    source: input.source,
    target: input.target,
    type: "flash",
    label: input.label ?? input.edgeType,
    data: { edgeType: input.edgeType },
  };
  const next = bump(canvas, { edges: [...canvas.edges, edge] });
  return { canvas: next, edge };
}

export function deleteEdge(meetingId: MeetingId, id: string): Canvas | undefined {
  const canvas = getCanvas(meetingId);
  if (!canvas) return undefined;
  const edges = canvas.edges.filter((e) => e.id !== id);
  return bump(canvas, { edges });
}

// Apply a batch of node/edge additions atomically (used by event ingestion).
export function applyBatch(
  meetingId: MeetingId,
  nodes: FlashNode[],
  edges: FlashEdge[],
): Canvas {
  const canvas = ensureCanvas(meetingId);
  return bump(canvas, {
    nodes: [...canvas.nodes, ...nodes],
    edges: [...canvas.edges, ...edges],
  });
}

// For tests / demo reset.
export function resetCanvas(meetingId: MeetingId): void {
  store.delete(meetingId);
}
