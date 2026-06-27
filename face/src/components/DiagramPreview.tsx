"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let initialized = false;
function ensureInit() {
  if (initialized) return;
  mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
  initialized = true;
}

let renderSeq = 0;

export default function DiagramPreview({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const trimmed = (code ?? "").trim();
    if (!trimmed) {
      setSvg("");
      setError("");
      return;
    }
    ensureInit();
    const id = `flash-mermaid-${renderSeq++}`;
    mermaid
      .render(id, trimmed)
      .then(({ svg: rendered }) => {
        if (cancelled || !mountedRef.current) return;
        setError("");
        setSvg(rendered);
      })
      .catch((err: unknown) => {
        if (cancelled || !mountedRef.current) return;
        setSvg("");
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="diagram-preview">
      {error ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            borderRadius: 8,
            padding: 10,
          }}
        >
          <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
            Diagram failed to render
          </div>
          <pre
            style={{
              margin: "6px 0 0",
              fontSize: 11,
              whiteSpace: "pre-wrap",
              fontFamily: "var(--mono)",
              color: "#5b6072",
            }}
          >
            {code}
          </pre>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 8,
            background: "#fff",
            overflow: "auto",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}

      <details style={{ marginTop: 8 }}>
        <summary
          style={{ fontSize: 11, color: "var(--text-soft)", cursor: "pointer" }}
        >
          Mermaid source
        </summary>
        <pre
          style={{
            margin: "6px 0 0",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            fontFamily: "var(--mono)",
            background: "var(--bg-soft)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 8,
            color: "var(--text)",
          }}
        >
          {code}
        </pre>
      </details>
    </div>
  );
}
