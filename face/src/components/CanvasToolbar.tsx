"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CANVAS_EDGE_TYPES, type CanvasEdgeType } from "@/lib/canvasTypes";

type EndState = "idle" | "ending" | "ended" | "error";

type Props = {
  nodeCount: number;
  edgeCount: number;
  lastSync: number | null;
  busy: string | null;
  addOpen: boolean;
  edgeType: CanvasEdgeType;
  onEdgeTypeChange: (t: CanvasEdgeType) => void;
  onToggleAdd: () => void;
  onAsk: (text: string) => void;
  onSummarize: () => void;
  onDemo: () => void;
  onExport: () => void;
  onAutoArrange: () => void;
};

function syncLabel(lastSync: number | null): string {
  if (!lastSync) return "syncing…";
  const secs = Math.max(0, Math.round((Date.now() - lastSync) / 1000));
  if (secs <= 1) return "just now";
  return `${secs}s ago`;
}

export default function CanvasToolbar({
  nodeCount,
  edgeCount,
  lastSync,
  busy,
  addOpen,
  edgeType,
  onEdgeTypeChange,
  onToggleAdd,
  onAsk,
  onSummarize,
  onDemo,
  onExport,
  onAutoArrange,
}: Props) {
  const [prompt, setPrompt] = useState("");
  const [endState, setEndState] = useState<EndState>("idle");
  const [clearing, setClearing] = useState(false);
  const [restartState, setRestartState] = useState<"idle" | "restarting" | "done">("idle");
  const router = useRouter();

  // The toolbar lives under /m/[meetingId]; read the id from the route rather
  // than threading a new prop through FlashCanvas.
  const params = useParams<{ meetingId?: string }>();
  const meetingId = typeof params?.meetingId === "string" ? params.meetingId : "";

  function submitPrompt(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    onAsk(text);
    setPrompt("");
  }

  // End meeting: finalize into summary/decision/action nodes, then push the
  // serialized graph to P2 memory. The canvas's normal GET poll renders the new
  // nodes; both endpoints already exist.
  async function endMeeting() {
    if (!meetingId || endState === "ending") return;
    setEndState("ending");
    try {
      const summarize = await fetch(`/api/canvas/${encodeURIComponent(meetingId)}/summarize`, {
        method: "POST",
      });
      if (!summarize.ok) {
        setEndState("error");
        return;
      }
      // Sync-memory is best-effort; the meeting is still "ended" if P2 is down.
      await fetch(`/api/canvas/${encodeURIComponent(meetingId)}/sync-memory`, {
        method: "POST",
      }).catch(() => undefined);
      setEndState("ended");
    } catch {
      setEndState("error");
    }
  }

  // Clear canvas: wipe the whole graph (memory + disk) and P2's stored context
  // so this meeting id starts from scratch. Guarded by a confirm.
  async function clearCanvas() {
    if (!meetingId || clearing) return;
    if (!window.confirm("Clear this canvas? This deletes every node, edge and stored meeting context. This cannot be undone.")) {
      return;
    }
    setClearing(true);
    try {
      await fetch(`/api/canvas/${encodeURIComponent(meetingId)}/reset`, { method: "POST" });
      setEndState("idle"); // a cleared canvas is a fresh meeting again
    } catch {
      /* the 1s poll will reflect whatever state the server is in */
    } finally {
      setClearing(false);
    }
  }

  // Restart Flash: soft-reset the agent (close any stuck Meet browser/state) so
  // it responds again. Doesn't touch the canvas.
  async function restartFlash() {
    if (restartState === "restarting") return;
    setRestartState("restarting");
    try {
      await fetch(`/api/agent/restart`, { method: "POST" });
      setRestartState("done");
      setTimeout(() => setRestartState("idle"), 2500);
    } catch {
      setRestartState("idle");
    }
  }

  // New meeting: end the current meeting (tell Flash to leave) and go back to the
  // home page to add Flash to a fresh meeting.
  async function newMeeting() {
    await fetch(`/api/agent/leave`, { method: "POST" }).catch(() => undefined);
    router.push("/");
  }

  const restartLabel =
    restartState === "restarting" ? "Restarting…" : restartState === "done" ? "Restarted ✓" : "Restart Flash";

  const endLabel =
    endState === "ending"
      ? "Ending…"
      : endState === "ended"
        ? "Meeting ended ✓"
        : endState === "error"
          ? "End failed — retry"
          : "End meeting";

  return (
    <div className="toolbar">
      <div className="toolbar-row">
        <div className="toolbar-brand">
          <span className="bolt">⚡</span>
          <span>Flash</span>
        </div>

        <form className="toolbar-ask" onSubmit={submitPrompt}>
          <input
            className="input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask Flash about this meeting…"
            autoComplete="off"
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy === "ask"}
          >
            {busy === "ask" ? "Asking…" : "Ask Flash"}
          </button>
        </form>

        <div className="toolbar-actions">
          <button
            type="button"
            className={addOpen ? "btn btn-primary" : "btn"}
            onClick={onToggleAdd}
          >
            {addOpen ? "Close add" : "+ Add node"}
          </button>
          <label className="edge-type-pick" title="Edge type used when you drag a connection">
            <span>link as</span>
            <select
              className="input"
              value={edgeType}
              onChange={(e) => onEdgeTypeChange(e.target.value as CanvasEdgeType)}
            >
              {CANVAS_EDGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={onAutoArrange}>
            Auto-arrange
          </button>
          <button
            type="button"
            className="btn"
            onClick={onSummarize}
            disabled={busy === "summarize"}
          >
            {busy === "summarize" ? "Summarizing…" : "Summarize"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onDemo}
            disabled={busy === "demo"}
          >
            {busy === "demo" ? "Seeding…" : "Demo"}
          </button>
          <button type="button" className="btn" onClick={onExport}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn"
            onClick={restartFlash}
            disabled={restartState === "restarting"}
            title="Soft-restart the Flash agent if it stops responding"
          >
            {restartLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={newMeeting}
            title="End this meeting and go to the home page to add Flash to a new meeting"
          >
            New meeting
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={clearCanvas}
            disabled={clearing || !meetingId}
            title="Delete all nodes, edges and stored context for this meeting"
          >
            {clearing ? "Clearing…" : "Clear canvas"}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={endMeeting}
            disabled={endState === "ending" || endState === "ended" || !meetingId}
          >
            {endLabel}
          </button>
        </div>
      </div>

      <div className="toolbar-status">
        <span>{nodeCount} nodes</span>
        <span>·</span>
        <span>{edgeCount} edges</span>
        <span>·</span>
        <span>synced {syncLabel(lastSync)}</span>
      </div>
    </div>
  );
}
