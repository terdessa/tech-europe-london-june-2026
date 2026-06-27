// Flash P4 — async orchestration shared by API routes and the command processor.
//
// These functions glue the in-memory canvas store + event ingestion to the P2
// (retrieval) and P3 (brain) clients. Every external call degrades gracefully:
// when P2/P3 are unconfigured or error, we fall back to local mocks so the demo
// path always produces a coherent graph (CLAUDE.md: "grounded, not hallucinated"
// — we prefer real retrieval, but never hard-fail the canvas).
//
// Immutable style: we never mutate canvases here; the store returns fresh copies.

import type { Canvas } from "./canvasTypes";
import { ensureCanvas, getCanvas, addNode, addEdge } from "./canvasStore";
import {
  createQuestionNode,
  applyAgentResponse,
  applyFinalize,
} from "./eventIngest";
import { retrieve, getTranscript, postSources, isP2Configured } from "./p2Client";
import type { RetrievedChunk } from "./p2Client";
import { callAgent, callFinalize, mockAgent, mockFinalize, isP3Configured } from "./p3Client";
import type { AgentResponse, FinalizeResponse } from "./p3Client";
import { toCanvasSourceItem } from "./serialize";

function truncate(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// Manual Flash invocation: question -> retrieve -> agent -> answer/diagram nodes.
export async function runManualPrompt(
  meetingId: string,
  text: string,
  speaker?: string,
): Promise<{
  canvas: Canvas;
  questionNodeId: string;
  answerNodeId: string;
  diagramNodeId?: string;
  usedMock: boolean;
  error?: string;
}> {
  const questionNodeId = createQuestionNode(meetingId, text, speaker);

  const { chunks, error: retrieveError } = await retrieve(meetingId, text, 8);
  const chunkTexts = chunks.map((c) => c.text);

  let response: AgentResponse | undefined;
  let usedMock = false;
  let error: string | undefined = retrieveError;

  if (isP3Configured()) {
    const agent = await callAgent(meetingId, text);
    if (agent.response) {
      response = agent.response;
    } else {
      usedMock = true;
      error = agent.error ?? error;
      response = mockAgent(text, chunkTexts);
    }
  } else {
    usedMock = true;
    response = mockAgent(text, chunkTexts);
  }

  const { answerNodeId, diagramNodeId } = applyAgentResponse(meetingId, {
    ...response,
    questionNodeId,
  });

  const canvas = getCanvas(meetingId) ?? ensureCanvas(meetingId);
  return { canvas, questionNodeId, answerNodeId, diagramNodeId, usedMock, error };
}

// Retrieval-only (or retrieval + memory_chunk node materialisation).
export async function runQuery(
  meetingId: string,
  query: string,
  k = 8,
  createNodes = false,
): Promise<{
  chunks: RetrievedChunk[];
  canvas: Canvas;
  questionNodeId?: string;
  error?: string;
}> {
  const { chunks, error } = await retrieve(meetingId, query, k);

  let questionNodeId: string | undefined;
  if (createNodes) {
    questionNodeId = createQuestionNode(meetingId, query);
    for (const chunk of chunks) {
      const { node } = addNode(meetingId, {
        nodeType: "memory_chunk",
        label: truncate(chunk.text, 60),
        detail: chunk.text,
        data: {
          source: chunk.source,
          score: chunk.score,
          speaker: chunk.speaker,
          ts: chunk.ts,
        },
      });
      addEdge(meetingId, {
        source: questionNodeId,
        target: node.id,
        edgeType: "derived_from",
      });
    }
  }

  const canvas = getCanvas(meetingId) ?? ensureCanvas(meetingId);
  return { chunks, canvas, questionNodeId, error };
}

// Post-meeting finalize: gather context, call P3 /finalize (or mock), build nodes.
export async function runSummarize(
  meetingId: string,
): Promise<{
  canvas: Canvas;
  summaryNodeId?: string;
  summary?: string;
  decisions?: string[];
  actionItems?: string[];
  usedMock: boolean;
  error?: string;
}> {
  let transcript: { utterances: Array<{ speaker?: string; text: string }> } = {
    utterances: [],
  };
  let error: string | undefined;

  if (isP2Configured()) {
    const t = await getTranscript(meetingId);
    transcript = { utterances: t.utterances };
    error = t.error;
    // Warm retrieval so canvas memory is considered (result not directly needed
    // here — applyFinalize works off the P3/mock summary).
    const r = await retrieve(meetingId, "meeting summary decisions action items", 8);
    error = error ?? r.error;
  }

  // Fallback source: the current graph itself (p4-plan.md — summarize gathers
  // "current graph nodes/edges" too). When P2 has no transcript, derive the
  // utterance list from speech/chat nodes so the mock still produces a summary.
  if (transcript.utterances.length === 0) {
    const current = getCanvas(meetingId);
    transcript = {
      utterances: (current?.nodes ?? [])
        .filter((n) => n.data.nodeType === "utterance" || n.data.nodeType === "chat_context")
        .map((n) => ({ speaker: n.data.speaker, text: n.data.detail ?? n.data.label })),
    };
  }

  let result: FinalizeResponse | undefined;
  let usedMock = false;

  if (isP3Configured()) {
    const fin = await callFinalize(meetingId);
    if (fin.result) {
      result = fin.result;
    } else {
      usedMock = true;
      error = fin.error ?? error;
      result = mockFinalize(transcript.utterances);
    }
  } else {
    usedMock = true;
    result = mockFinalize(transcript.utterances);
  }

  const { summaryNodeId } = applyFinalize(meetingId, result);
  const canvas = getCanvas(meetingId) ?? ensureCanvas(meetingId);
  return {
    canvas,
    summaryNodeId,
    summary: result.summary,
    decisions: result.decisions,
    actionItems: result.actionItems,
    usedMock,
    error,
  };
}

// Push the full serialized canvas to P2 as a "canvas" source item.
export async function runSyncMemory(
  meetingId: string,
): Promise<{ ok: boolean; version: number; chunksSent?: unknown; error?: string }> {
  const canvas = getCanvas(meetingId);
  if (!canvas) return { ok: false, version: 0, error: "no canvas" };

  const item = toCanvasSourceItem(canvas);
  const res = await postSources(meetingId, [item]);
  return {
    ok: res.ok,
    version: canvas.version,
    chunksSent: res.sources,
    error: res.error,
  };
}
