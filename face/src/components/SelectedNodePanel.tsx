"use client";

import { useEffect, useState } from "react";
import type { FlashNode, UpdateNodeInput } from "@/lib/canvasTypes";
import { getNodeStyle } from "@/lib/nodeStyles";
import DiagramPreview from "./DiagramPreview";

type Props = {
  node: FlashNode | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onSave: (id: string, changes: UpdateNodeInput) => void;
};

// Inspect AND edit a node's content. Label/details are always editable;
// url (link/image) and mermaid (diagram) appear for the relevant types.
export default function SelectedNodePanel({ node, onClose, onDelete, onSave }: Props) {
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [url, setUrl] = useState("");
  const [diagramCode, setDiagramCode] = useState("");

  // Re-seed the form whenever a different node is selected.
  useEffect(() => {
    if (!node) return;
    setLabel(node.data.label ?? "");
    setDetail(node.data.detail ?? "");
    setUrl(node.data.url ?? "");
    setDiagramCode(node.data.diagramCode ?? "");
  }, [node?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;
  const style = getNodeStyle(node.data.nodeType);
  const isImage = node.data.nodeType === "image";
  const isLink = node.data.nodeType === "link";
  const isDiagram = node.data.nodeType === "diagram" || Boolean(node.data.diagramCode);

  const dirty =
    label !== (node.data.label ?? "") ||
    detail !== (node.data.detail ?? "") ||
    url !== (node.data.url ?? "") ||
    diagramCode !== (node.data.diagramCode ?? "");

  function save() {
    if (!node) return;
    const data: NonNullable<UpdateNodeInput["data"]> = {};
    if (url !== (node.data.url ?? "")) data.url = url;
    if (diagramCode !== (node.data.diagramCode ?? "")) data.diagramCode = diagramCode;
    onSave(node.id, {
      label,
      detail,
      data: Object.keys(data).length ? data : undefined,
    });
  }

  return (
    <aside className="node-panel">
      <div className="node-panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span>{style.emoji}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: style.color,
            }}
          >
            {style.label}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      <div className="node-panel-body">
        <label className="add-field">
          <span>Title / label</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>

        <label className="add-field">
          <span>Details</span>
          <textarea
            className="input add-textarea"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
          />
        </label>

        {(isLink || isImage) && (
          <label className="add-field">
            <span>URL</span>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        )}

        {isDiagram && (
          <label className="add-field">
            <span>Mermaid code</span>
            <textarea
              className="input add-textarea add-mono"
              value={diagramCode}
              onChange={(e) => setDiagramCode(e.target.value)}
              rows={5}
            />
          </label>
        )}

        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={!dirty}
          style={{ justifyContent: "center", width: "100%", marginTop: 4 }}
        >
          {dirty ? "Save changes" : "Saved"}
        </button>

        {isImage && url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            style={{ marginTop: 12, width: "100%", borderRadius: 8, border: "1px solid var(--border)" }}
          />
        )}

        {isDiagram && diagramCode && (
          <div style={{ marginTop: 12 }}>
            <div className="node-panel-section">Preview</div>
            <DiagramPreview code={diagramCode} />
          </div>
        )}

        {node.data.sources && node.data.sources.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="node-panel-section">Sources</div>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
              {node.data.sources.map((s, i) => (
                <li key={i} style={{ color: "var(--text-soft)" }}>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="node-panel-section" style={{ marginTop: 12 }}>
          Node data
        </div>
        <pre className="node-panel-json">{JSON.stringify(node, null, 2)}</pre>
      </div>

      <div className="node-panel-foot">
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => onDelete(node.id)}
          style={{ width: "100%", justifyContent: "center" }}
        >
          Delete node
        </button>
      </div>
    </aside>
  );
}
