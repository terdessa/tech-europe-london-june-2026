"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlashNodeData } from "@/lib/canvasTypes";
import { getNodeStyle } from "@/lib/nodeStyles";

// React Flow passes data as a generic Record; we read the Flash fields off it.
function CanvasNodeImpl({ data, selected }: NodeProps) {
  const d = data as FlashNodeData;
  const style = getNodeStyle(d.nodeType);
  const hasDiagram = Boolean(d.diagramCode);
  const meta = d.speaker || d.source;

  return (
    <div
      className="cnode"
      style={{
        width: 220,
        background: "#ffffff",
        border: `1px solid ${style.color}`,
        borderRadius: 12,
        boxShadow: selected
          ? `0 0 0 3px ${style.bg}, 0 8px 24px rgba(20,24,40,0.16)`
          : "0 2px 8px rgba(20,24,40,0.08)",
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      {/* coloured left accent + header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "7px 10px",
          background: style.bg,
          borderBottom: `1px solid ${style.color}22`,
          borderLeft: `4px solid ${style.color}`,
        }}
      >
        <span style={{ fontSize: 13 }}>{style.emoji}</span>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: style.color,
          }}
        >
          {style.label}
        </span>
        {hasDiagram && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              fontWeight: 700,
              color: "#8b5cf6",
              background: "#f5f3ff",
              border: "1px solid #ddd6fe",
              borderRadius: 6,
              padding: "1px 5px",
            }}
          >
            DIAGRAM
          </span>
        )}
      </div>

      {/* title */}
      <div style={{ padding: "9px 11px" }}>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.35,
            fontWeight: 600,
            color: "#1a1c23",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={d.label}
        >
          {d.label}
        </div>

        {/* image thumbnail for image nodes */}
        {d.nodeType === "image" && d.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={d.url}
            alt={d.label}
            style={{
              marginTop: 8,
              width: "100%",
              borderRadius: 8,
              border: "1px solid #e6e8f0",
              display: "block",
            }}
          />
        )}

        {/* compact code snippet for diagram nodes (full render is in the panel) */}
        {d.diagramCode && (
          <pre
            style={{
              marginTop: 8,
              padding: "6px 8px",
              background: "#f7f7fb",
              border: "1px solid #ececf3",
              borderRadius: 8,
              fontSize: 9,
              lineHeight: 1.3,
              color: "#5b6072",
              whiteSpace: "pre-wrap",
              maxHeight: 64,
              overflow: "hidden",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            {d.diagramCode.split("\n").slice(0, 4).join("\n")}
          </pre>
        )}

        {meta && (
          <div
            style={{
              marginTop: 7,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              fontSize: 10,
              color: "#5b6072",
            }}
          >
            {d.speaker && (
              <span style={{ fontWeight: 600 }}>👤 {d.speaker}</span>
            )}
            {d.source && <span>· {d.source}</span>}
          </div>
        )}
      </div>

      {/* Handles aligned to the left→right flow: target in on the left,
          source out on the right. One of each so edges connect deterministically
          and never leave from the bottom / arrive from the side. */}
      <Handle type="target" position={Position.Left} style={handleStyle} />
      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}

const handleStyle = {
  width: 7,
  height: 7,
  background: "#b4b8c8",
  border: "1px solid #ffffff",
};

export const CanvasNode = memo(CanvasNodeImpl);
export default CanvasNode;
