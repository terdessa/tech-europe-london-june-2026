// Flash P4 — per-node-type colour tokens for the light-mode canvas.
// Each CanvasNodeType maps to an accent colour, a soft background, a human
// label, and an emoji used in the node header chip and the MiniMap.

import type { CanvasNodeType } from "./canvasTypes";

export type NodeStyle = {
  color: string; // accent / border / header colour (solid)
  bg: string; // soft background tint for the header chip
  label: string; // human-readable label shown in the chip
  emoji?: string;
};

export const NODE_STYLES: Record<CanvasNodeType, NodeStyle> = {
  speaker: { color: "#4f46e5", bg: "#eef2ff", label: "Speaker", emoji: "🗣️" },
  utterance: { color: "#6366f1", bg: "#eef2ff", label: "Utterance", emoji: "💬" },
  chat_context: { color: "#0ea5e9", bg: "#e0f2fe", label: "Chat", emoji: "💭" },
  document: { color: "#475569", bg: "#f1f5f9", label: "Document", emoji: "📄" },
  image: { color: "#db2777", bg: "#fce7f3", label: "Image", emoji: "🖼️" },
  link: { color: "#0891b2", bg: "#ecfeff", label: "Link", emoji: "🔗" },
  topic: { color: "#7c3aed", bg: "#f5f3ff", label: "Topic", emoji: "🏷️" },
  question: { color: "#2563eb", bg: "#eff6ff", label: "Question", emoji: "❓" },
  flash_answer: { color: "#059669", bg: "#ecfdf5", label: "Flash", emoji: "⚡" },
  diagram: { color: "#8b5cf6", bg: "#f5f3ff", label: "Diagram", emoji: "📊" },
  decision: { color: "#d97706", bg: "#fffbeb", label: "Decision", emoji: "✅" },
  action_item: { color: "#ea580c", bg: "#fff7ed", label: "Action", emoji: "📌" },
  summary: { color: "#0d9488", bg: "#f0fdfa", label: "Summary", emoji: "📝" },
  source: { color: "#64748b", bg: "#f8fafc", label: "Source", emoji: "📚" },
  memory_chunk: { color: "#6b7280", bg: "#f9fafb", label: "Memory", emoji: "🧠" },
};

const FALLBACK_STYLE: NodeStyle = {
  color: "#6b7280",
  bg: "#f9fafb",
  label: "Node",
};

export function getNodeStyle(t: CanvasNodeType): NodeStyle {
  return NODE_STYLES[t] ?? FALLBACK_STYLE;
}
