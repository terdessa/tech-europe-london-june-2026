// Smart graph layout for the canvas.
//
// The store assigns rough "lane" positions, but a meeting graph has real
// structure (speaker → utterance → question → answer → diagram, doc → source,
// summary → decision/action). We run dagre to produce a clean directed
// hierarchical layout so edges flow consistently in one direction instead of
// criss-crossing. Direction is left → right (a meeting reads as a timeline).

import dagre from "@dagrejs/dagre";
import { Position, type Node, type Edge } from "@xyflow/react";

// Must roughly match the rendered card size in CanvasNode.tsx for tidy spacing.
const NODE_W = 230;
const NODE_H = 104;

export type LayoutDirection = "LR" | "TB";

export const FLOW_DIRECTION: LayoutDirection = "LR";

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = FLOW_DIRECTION,
  pinned?: Map<string, { x: number; y: number }>,
): Node[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 36, // gap between nodes in the same rank
    ranksep: 110, // gap between ranks (columns for LR)
    marginx: 24,
    marginy: 24,
  });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  for (const e of edges) {
    if (e.source && e.target) g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const horizontal = direction === "LR";
  return nodes.map((n) => {
    // Respect a user-dragged ("pinned") position when one exists.
    const pin = pinned?.get(n.id);
    if (pin) {
      return {
        ...n,
        position: pin,
        sourcePosition: horizontal ? Position.Right : Position.Bottom,
        targetPosition: horizontal ? Position.Left : Position.Top,
      };
    }
    const p = g.node(n.id);
    // dagre returns the node CENTRE; React Flow wants the top-left corner.
    return {
      ...n,
      position: { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 },
      sourcePosition: horizontal ? Position.Right : Position.Bottom,
      targetPosition: horizontal ? Position.Left : Position.Top,
    };
  });
}

// Stable signature of graph structure (ids only) so we re-layout when nodes or
// edges are added/removed, but not on every harmless poll.
export function structureSignature(nodes: Node[], edges: Edge[]): string {
  const ns = nodes.map((n) => n.id).sort().join(",");
  const es = edges.map((e) => e.id).sort().join(",");
  return `${ns}|${es}`;
}
