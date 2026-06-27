"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type MeetingSummary = {
  meetingId: string;
  lastTs?: number;
  utteranceCount?: number;
  nodeCount?: number;
  hasCanvas: boolean;
};

type JoinState =
  | { kind: "idle" }
  | { kind: "joining" }
  | { kind: "joined" }
  | { kind: "error"; message: string };

function relativeTime(ts: number): string {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function metaLine(m: MeetingSummary): string {
  const parts: string[] = [];
  if (typeof m.utteranceCount === "number") parts.push(`${m.utteranceCount} utterances`);
  if (typeof m.nodeCount === "number") parts.push(`${m.nodeCount} nodes`);
  if (typeof m.lastTs === "number") parts.push(relativeTime(m.lastTs));
  return parts.join(" · ");
}

export default function HomePage() {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState("demo");
  const [meetUrl, setMeetUrl] = useState("");
  const [join, setJoin] = useState<JoinState>({ kind: "idle" });

  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/meetings");
        const json = (await res.json()) as { meetings?: MeetingSummary[] };
        if (!cancelled) setMeetings(Array.isArray(json.meetings) ? json.meetings : []);
      } catch {
        if (!cancelled) setMeetings([]);
      } finally {
        if (!cancelled) setLoadingMeetings(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openCanvas(e: React.FormEvent) {
    e.preventDefault();
    const id = meetingId.trim() || "demo";
    const query = meetUrl.trim()
      ? `?meet=${encodeURIComponent(meetUrl.trim())}`
      : "";
    router.push(`/m/${encodeURIComponent(id)}${query}`);
  }

  async function addFlash() {
    const id = meetingId.trim() || "demo";
    const url = meetUrl.trim();
    if (!url) return;
    setJoin({ kind: "joining" });
    try {
      const res = await fetch("/api/agent/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meetingId: id, meetUrl: url }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) {
        setJoin({ kind: "joined" });
      } else {
        setJoin({ kind: "error", message: json.error ?? "Could not add Flash to the meeting" });
      }
    } catch (err) {
      setJoin({ kind: "error", message: String(err) });
    }
  }

  const meetUrlEmpty = meetUrl.trim().length === 0;

  return (
    <main className="launcher">
      <div className="launcher-card">
        <div className="wordmark">
          <span className="bolt">⚡</span>
          <span>Flash</span>
        </div>
        <p className="tagline">Your meeting&apos;s memory, as a living canvas.</p>

        <form onSubmit={openCanvas}>
          <div className="field">
            <label htmlFor="meetingId">Meeting ID</label>
            <input
              id="meetingId"
              className="input"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              placeholder="demo"
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="meetUrl">Google Meet URL (optional)</label>
            <input
              id="meetUrl"
              className="input"
              value={meetUrl}
              onChange={(e) => {
                setMeetUrl(e.target.value);
                setJoin({ kind: "idle" });
              }}
              placeholder="https://meet.google.com/abc-defg-hij"
              autoComplete="off"
            />
          </div>

          <div className="launcher-actions">
            <button type="submit" className="btn btn-primary">
              Open canvas →
            </button>
            <button
              type="button"
              className="btn"
              onClick={addFlash}
              disabled={meetUrlEmpty || join.kind === "joining"}
            >
              {join.kind === "joining"
                ? "Joining…"
                : join.kind === "joined"
                  ? "Flash joined ✓"
                  : "⚡ Add Flash to meeting"}
            </button>
          </div>
        </form>

        {join.kind === "error" && (
          <p style={{ marginTop: 14, fontSize: 13, color: "#b91c1c" }}>{join.message}</p>
        )}
        {join.kind === "joined" && (
          <p style={{ marginTop: 14, fontSize: 13, color: "#475569" }}>
            Flash is joining the call.{" "}
            <Link href={`/m/${encodeURIComponent(meetingId.trim() || "demo")}`}>
              Open the canvas →
            </Link>
          </p>
        )}
      </div>

      <div className="launcher-card">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recent meetings</h2>
        {loadingMeetings ? (
          <p style={{ marginTop: 14, fontSize: 13, color: "#475569" }}>Loading…</p>
        ) : meetings.length === 0 ? (
          <p style={{ marginTop: 14, fontSize: 13, color: "#475569" }}>
            No meetings yet. Start one above and Flash will remember it here.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {meetings.map((m) => (
              <li key={m.meetingId}>
                <Link
                  href={`/m/${encodeURIComponent(m.meetingId)}`}
                  className="btn"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                    gap: 12,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{m.meetingId}</span>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{metaLine(m) || "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
