"use client";

import type { FlashNode } from "@/lib/canvasTypes";
import { getNodeStyle } from "@/lib/nodeStyles";
import DiagramPreview from "./DiagramPreview";

type Props = {
  node: FlashNode | null;
  onClose: () => void;
  onDelete: (id: string) => void;
};

export default function SelectedNodePanel({ node, onClose, onDelete }: Props) {
  if (!node) return null;
  const style = getNodeStyle(node.data.nodeType);
  const diagramCode = node.data.diagramCode;

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
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>

      <div className="node-panel-title">{node.data.label}</div>

      <div className="node-panel-body">
        {diagramCode && (
          <div style={{ marginBottom: 12 }}>
            <DiagramPreview code={diagramCode} />
          </div>
        )}

        {node.data.url && (
          <a
            href={node.data.url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, wordBreak: "break-all" }}
          >
            🔗 {node.data.url}
          </a>
        )}

        {node.data.sources && node.data.sources.length > 0 && (
          <div style={{ marginTop: 10 }}>
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
        <pre className="node-panel-json">
          {JSON.stringify(node, null, 2)}
        </pre>
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
