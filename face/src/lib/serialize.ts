// Serializes the React Flow graph for P2's canvas-memory contract.
// p4-plan.md "Canvas Memory Contract": send raw graph JSON + a plain-text
// rendering of every node/edge so Superlinked can retrieve over visual memory.

import type { Canvas, FlashNode } from "./canvasTypes";
import type { SourceItem } from "./p2Client";

function nodeLine(n: FlashNode): string {
  const d = n.data;
  const parts = [`[${d.nodeType}] ${d.label}`];
  if (d.speaker) parts.push(`(by ${d.speaker})`);
  if (d.detail && d.detail !== d.label) parts.push(`— ${d.detail}`);
  if (d.url) parts.push(`<${d.url}>`);
  if (d.diagramCode) parts.push(`\n  mermaid:\n${indent(d.diagramCode)}`);
  if (d.sources?.length) parts.push(`\n  sources: ${d.sources.join("; ")}`);
  return parts.join(" ");
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}

export function renderCanvasText(canvas: Canvas): string {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n] as const));
  const nodeLines = canvas.nodes.map((n) => `- ${nodeLine(n)}`);
  const edgeLines = canvas.edges.map((e) => {
    const s = byId.get(e.source)?.data.label ?? e.source;
    const t = byId.get(e.target)?.data.label ?? e.target;
    return `- ${s} —[${e.data.edgeType}]→ ${t}`;
  });
  return [
    `Flash canvas snapshot v${canvas.version} for meeting ${canvas.meetingId}`,
    "",
    `## Nodes (${canvas.nodes.length})`,
    ...nodeLines,
    "",
    `## Relationships (${canvas.edges.length})`,
    ...edgeLines,
  ].join("\n");
}

// Build the P2 /sources item for this canvas snapshot.
export function toCanvasSourceItem(canvas: Canvas): SourceItem {
  return {
    type: "canvas",
    title: `Flash canvas snapshot v${canvas.version}`,
    content: renderCanvasText(canvas),
    metadata: {
      canvasVersion: canvas.version,
      nodes: canvas.nodes,
      edges: canvas.edges,
    },
  };
}
