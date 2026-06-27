"use client";

import { useState } from "react";
import {
  CANVAS_NODE_TYPES,
  type AddNodeInput,
  type CanvasNodeType,
} from "@/lib/canvasTypes";
import { getNodeStyle } from "@/lib/nodeStyles";

type Props = {
  onAdd: (input: AddNodeInput) => void;
  onClose: () => void;
};

// Manually create a node with whatever content is needed. Type-specific fields
// (url for link/image, mermaid for diagram) appear when relevant.
export default function AddNodePanel({ onAdd, onClose }: Props) {
  const [nodeType, setNodeType] = useState<CanvasNodeType>("topic");
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [url, setUrl] = useState("");
  const [diagramCode, setDiagramCode] = useState("");

  const needsUrl = nodeType === "link" || nodeType === "image";
  const needsDiagram = nodeType === "diagram";
  const style = getNodeStyle(nodeType);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    const data: AddNodeInput["data"] = {};
    if (needsUrl && url.trim()) data.url = url.trim();
    if (needsDiagram && diagramCode.trim()) data.diagramCode = diagramCode.trim();
    onAdd({
      nodeType,
      label: trimmed,
      detail: detail.trim() || undefined,
      data: Object.keys(data).length ? data : undefined,
    });
    setLabel("");
    setDetail("");
    setUrl("");
    setDiagramCode("");
  }

  return (
    <aside className="add-panel">
      <div className="node-panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span>{style.emoji}</span>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Add node</span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <form className="add-panel-body" onSubmit={submit}>
        <label className="add-field">
          <span>Type</span>
          <select
            className="input"
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as CanvasNodeType)}
          >
            {CANVAS_NODE_TYPES.map((t) => (
              <option key={t} value={t}>
                {getNodeStyle(t).emoji} {getNodeStyle(t).label} ({t})
              </option>
            ))}
          </select>
        </label>

        <label className="add-field">
          <span>Title / label *</span>
          <input
            className="input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Reduce ad spend by 30%"
            autoFocus
          />
        </label>

        <label className="add-field">
          <span>Details</span>
          <textarea
            className="input add-textarea"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Optional longer content for this node…"
            rows={3}
          />
        </label>

        {needsUrl && (
          <label className="add-field">
            <span>URL</span>
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… (or data: URI for an image)"
            />
          </label>
        )}

        {needsDiagram && (
          <label className="add-field">
            <span>Mermaid code</span>
            <textarea
              className="input add-textarea add-mono"
              value={diagramCode}
              onChange={(e) => setDiagramCode(e.target.value)}
              placeholder={"flowchart LR\n  A --> B"}
              rows={5}
            />
          </label>
        )}

        <button type="submit" className="btn btn-primary" style={{ justifyContent: "center" }}>
          + Add to canvas
        </button>
        <p className="add-hint">
          Tip: drag from a node&apos;s right dot to another node&apos;s left dot to connect them.
        </p>
      </form>
    </aside>
  );
}
