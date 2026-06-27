"use client";

import { useState } from "react";

type Props = {
  nodeCount: number;
  edgeCount: number;
  lastSync: number | null;
  busy: string | null;
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
  onAsk,
  onSummarize,
  onDemo,
  onExport,
  onAutoArrange,
}: Props) {
  const [prompt, setPrompt] = useState("");

  function submitPrompt(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text) return;
    onAsk(text);
    setPrompt("");
  }

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
