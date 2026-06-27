"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const [meetingId, setMeetingId] = useState("demo");
  const [meetUrl, setMeetUrl] = useState("");

  function openCanvas(e: React.FormEvent) {
    e.preventDefault();
    const id = meetingId.trim() || "demo";
    const query = meetUrl.trim()
      ? `?meet=${encodeURIComponent(meetUrl.trim())}`
      : "";
    router.push(`/m/${encodeURIComponent(id)}${query}`);
  }

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
              onChange={(e) => setMeetUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              autoComplete="off"
            />
          </div>

          <div className="launcher-actions">
            <button type="submit" className="btn btn-primary">
              Open canvas →
            </button>
            <Link href="/m/demo" className="btn">
              ⚡ Open /m/demo
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
