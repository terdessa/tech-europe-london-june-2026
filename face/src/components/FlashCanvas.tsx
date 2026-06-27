"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge as rfAddEdge,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type {
  AddNodeInput,
  Canvas,
  CanvasEdgeType,
  FlashNode,
  UpdateNodeInput,
} from "@/lib/canvasTypes";
import { getNodeStyle } from "@/lib/nodeStyles";
import { layoutGraph } from "@/lib/autoLayout";
import CanvasNode from "./CanvasNode";
import CanvasToolbar from "./CanvasToolbar";
import SelectedNodePanel from "./SelectedNodePanel";
import AddNodePanel from "./AddNodePanel";

const POLL_MS = 1000;
const nodeTypes: NodeTypes = { flash: CanvasNode };

function apiBase(meetingId: string): string {
  return `/api/canvas/${encodeURIComponent(meetingId)}`;
}

// Narrow a server canvas into the React Flow node/edge shapes.
function toFlowNodes(canvas: Canvas): Node[] {
  return canvas.nodes.map((n) => ({
    id: n.id,
    type: "flash",
    position: n.position,
    data: { ...n.data },
  }));
}

function toFlowEdges(canvas: Canvas): Edge[] {
  return canvas.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    data: { ...e.data },
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#9aa0b4" },
    style: { stroke: "#b4b8c8", strokeWidth: 1.5 },
    labelStyle: { fontSize: 9, fill: "#6b7088", fontWeight: 600 },
    labelBgStyle: { fill: "#ffffff", fillOpacity: 0.85 },
    labelBgPadding: [3, 1] as [number, number],
    labelBgBorderRadius: 4,
  }));
}

function FlashCanvasInner({ meetingId }: { meetingId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newEdgeType, setNewEdgeType] = useState<CanvasEdgeType>("mentions");

  const versionRef = useRef<number>(-1);
  const draggingRef = useRef<boolean>(false);
  const seededRef = useRef<boolean>(false);
  // Positions the user has manually dragged — these stay put across re-layouts.
  const pinnedRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const { fitView } = useReactFlow();
  const nodeCountRef = useRef<number>(0);

  // ---- polling --------------------------------------------------------
  const fetchCanvas = useCallback(async () => {
    try {
      const res = await fetch(apiBase(meetingId), { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (!json?.ok || !json.canvas) return;
      const canvas = json.canvas as Canvas;
      setLastSync(Date.now());

      // Auto-seed the demo meeting once if empty.
      if (
        meetingId === "demo" &&
        !seededRef.current &&
        canvas.nodes.length === 0
      ) {
        seededRef.current = true;
        await fetch(`${apiBase(meetingId)}/demo`, { method: "POST" });
        return; // next poll picks up the seeded graph
      }

      // Only replace local state when the server version changed and we are
      // not mid-drag (avoids clobbering an in-flight node move). We ignore the
      // server's rough positions and run dagre for a clean directed layout;
      // dagre is deterministic so the same graph lays out identically (no jitter)
      // and user-dragged nodes are kept in place via pinnedRef.
      if (canvas.version !== versionRef.current && !draggingRef.current) {
        versionRef.current = canvas.version;
        const flowNodes = toFlowNodes(canvas);
        const flowEdges = toFlowEdges(canvas);
        setNodes(layoutGraph(flowNodes, flowEdges, "LR", pinnedRef.current));
        setEdges(flowEdges);
      }
    } catch {
      // transient network error — next tick retries
    }
  }, [meetingId]);

  useEffect(() => {
    fetchCanvas();
    const id = setInterval(fetchCanvas, POLL_MS);
    return () => clearInterval(id);
  }, [fetchCanvas]);

  // Refit the viewport whenever the number of nodes changes (new graph, demo
  // seed, or a freshly added node) so the whole arrangement stays in view.
  useEffect(() => {
    if (nodes.length !== nodeCountRef.current) {
      nodeCountRef.current = nodes.length;
      const t = setTimeout(() => fitView({ padding: 0.18, duration: 350 }), 60);
      return () => clearTimeout(t);
    }
  }, [nodes, fitView]);

  // ---- change handlers ------------------------------------------------
  const persistMove = useCallback(
    async (nodeId: string, position: { x: number; y: number }) => {
      try {
        await fetch(`${apiBase(meetingId)}/nodes/${encodeURIComponent(nodeId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ position }),
        });
      } catch {
        // best effort; next poll reconciles
      }
    },
    [meetingId]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // track drag state so polling doesn't clobber a live move
      for (const c of changes) {
        if (c.type === "position") {
          draggingRef.current = Boolean(c.dragging);
        }
      }
      setNodes((cur) => {
        const next = applyNodeChanges(changes, cur);
        for (const c of changes) {
          if (c.type === "position" && c.dragging === false) {
            const moved = next.find((n) => n.id === c.id);
            if (moved) {
              // Pin the dragged position so future auto-layouts respect it.
              pinnedRef.current.set(moved.id, moved.position);
              persistMove(moved.id, moved.position);
            }
          }
        }
        return next;
      });
    },
    [persistMove]
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((cur) => applyEdgeChanges(changes, cur));
  }, []);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    setSelectedId(node.id);
  }, []);

  // ---- toolbar actions ------------------------------------------------
  const refetch = useCallback(async () => {
    versionRef.current = -1; // force a refresh on next read
    await fetchCanvas();
  }, [fetchCanvas]);

  const onAsk = useCallback(
    async (text: string) => {
      setBusy("ask");
      try {
        await fetch(`${apiBase(meetingId)}/events`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "manual_prompt", text }),
        });
        await refetch();
      } finally {
        setBusy(null);
      }
    },
    [meetingId, refetch]
  );

  const onSummarize = useCallback(async () => {
    setBusy("summarize");
    try {
      await fetch(`${apiBase(meetingId)}/summarize`, { method: "POST" });
      await refetch();
    } finally {
      setBusy(null);
    }
  }, [meetingId, refetch]);

  const onDemo = useCallback(async () => {
    setBusy("demo");
    try {
      await fetch(`${apiBase(meetingId)}/demo`, { method: "POST" });
      await refetch();
    } finally {
      setBusy(null);
    }
  }, [meetingId, refetch]);

  const onAutoArrange = useCallback(() => {
    // Forget manual placements and re-run the directed layout from scratch.
    pinnedRef.current.clear();
    setNodes(layoutGraph(nodes, edges, "LR"));
  }, [nodes, edges]);

  // ---- manual editing -------------------------------------------------
  const onAddNode = useCallback(
    async (input: AddNodeInput) => {
      try {
        await fetch(`${apiBase(meetingId)}/nodes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        await refetch();
      } catch {
        // best effort
      }
    },
    [meetingId, refetch]
  );

  const onSaveNode = useCallback(
    async (id: string, changes: UpdateNodeInput) => {
      try {
        await fetch(`${apiBase(meetingId)}/nodes/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(changes),
        });
        await refetch();
      } catch {
        // best effort
      }
    },
    [meetingId, refetch]
  );

  // Drag from a node's right (source) dot to another node's left (target) dot.
  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      // optimistic local edge so the line shows immediately
      setEdges((cur) => rfAddEdge({ ...conn, type: "smoothstep" }, cur));
      (async () => {
        try {
          await fetch(`${apiBase(meetingId)}/edges`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: conn.source,
              target: conn.target,
              edgeType: newEdgeType,
            }),
          });
          await refetch();
        } catch {
          // best effort; next poll reconciles
        }
      })();
    },
    [meetingId, newEdgeType, refetch]
  );

  const onExport = useCallback(() => {
    const payload = JSON.stringify({ meetingId, nodes, edges }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flash-canvas-${meetingId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [meetingId, nodes, edges]);

  const onDelete = useCallback(
    async (nodeId: string) => {
      setSelectedId(null);
      setNodes((cur) => cur.filter((n) => n.id !== nodeId));
      try {
        await fetch(`${apiBase(meetingId)}/nodes/${encodeURIComponent(nodeId)}`, {
          method: "DELETE",
        });
      } finally {
        await refetch();
      }
    },
    [meetingId, refetch]
  );

  // ---- selected node (reconstructed as FlashNode for the panel) -------
  const selectedFlowNode = selectedId
    ? nodes.find((n) => n.id === selectedId)
    : null;
  const selectedNode: FlashNode | null = selectedFlowNode
    ? ({
        id: selectedFlowNode.id,
        type: "flash",
        position: selectedFlowNode.position,
        data: selectedFlowNode.data,
      } as FlashNode)
    : null;

  return (
    <div className="flash-canvas-root">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={() => setSelectedId(null)}
        fitView
        proOptions={{ hideAttribution: false }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={1}
          color="#d0d0d8"
        />
        <Controls />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const data = n.data as { nodeType?: FlashNode["data"]["nodeType"] };
            return data?.nodeType ? getNodeStyle(data.nodeType).color : "#cbd5e1";
          }}
          nodeStrokeWidth={2}
          maskColor="rgba(247,248,251,0.7)"
        />
      </ReactFlow>

      <CanvasToolbar
        nodeCount={nodes.length}
        edgeCount={edges.length}
        lastSync={lastSync}
        busy={busy}
        addOpen={addOpen}
        edgeType={newEdgeType}
        onEdgeTypeChange={setNewEdgeType}
        onToggleAdd={() => setAddOpen((v) => !v)}
        onAsk={onAsk}
        onSummarize={onSummarize}
        onDemo={onDemo}
        onExport={onExport}
        onAutoArrange={onAutoArrange}
      />

      {addOpen && (
        <AddNodePanel onAdd={onAddNode} onClose={() => setAddOpen(false)} />
      )}

      <SelectedNodePanel
        node={selectedNode}
        onClose={() => setSelectedId(null)}
        onDelete={onDelete}
        onSave={onSaveNode}
      />
    </div>
  );
}

export default function FlashCanvas({ meetingId }: { meetingId: string }) {
  return (
    <ReactFlowProvider>
      <FlashCanvasInner meetingId={meetingId} />
    </ReactFlowProvider>
  );
}
