// Flash P4 — demo graph builder.
//
// Produces a realistic budget-planning meeting graph for the on-stage demo
// (CLAUDE.md "Demo": "we have 5,000 budget — spent 500 on X, 1,000 on Y").
// Built mostly through the ingest helpers so speaker/said/source/cite edges are
// created the same way as live events. A few extra nodes/edges are added
// directly so the demo exercises EVERY node type (15) and EVERY edge type (11)
// — handy for validating the renderer. Idempotent: resetCanvas first.

import type { Canvas, CanvasEdgeType } from "./canvasTypes";
import { resetCanvas, getCanvas, ensureCanvas, addNode, addEdge } from "./canvasStore";
import {
  ingestUtterance,
  ingestChat,
  ingestSource,
  createQuestionNode,
  applyAgentResponse,
  applyFinalize,
} from "./eventIngest";

// A self-contained sample image (no network needed): a tiny budget bar chart.
function sampleChartDataUri(): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
  <rect width="320" height="180" fill="#ffffff"/>
  <text x="16" y="26" font-family="sans-serif" font-size="14" font-weight="700" fill="#1a1c23">Q3 Budget split (5000)</text>
  <rect x="16" y="120" width="70" height="36" fill="#f59e0b"/>
  <rect x="110" y="84" width="70" height="72" fill="#6366f1"/>
  <rect x="204" y="46" width="70" height="110" fill="#10b981"/>
  <text x="22" y="172" font-family="sans-serif" font-size="11" fill="#5b6072">Design 500</text>
  <text x="120" y="172" font-family="sans-serif" font-size="11" fill="#5b6072">Ads 1000</text>
  <text x="206" y="172" font-family="sans-serif" font-size="11" fill="#5b6072">Left 3500</text>
</svg>`.trim();
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function buildDemoGraph(meetingId: string): Canvas {
  resetCanvas(meetingId);

  const edge = (source: string, target: string, edgeType: CanvasEdgeType) =>
    addEdge(meetingId, { source, target, edgeType });

  // A topic node that anchors the discussion.
  const topicId = addNode(meetingId, {
    nodeType: "topic",
    label: "Q3 Budget Planning",
    detail: "Deciding how to allocate the remaining Q3 budget.",
    data: { source: "meeting" },
  }).node.id;

  // Prep docs / links / images shared before the meeting (each spawns a `source`
  // node via a derived_from edge).
  const docId = ingestSource(meetingId, "document", {
    title: "Q3 Plan",
    content:
      "Q3 marketing plan. Total budget 5000. Targets: design refresh, paid ads, contingency.",
  });
  const linkId = ingestSource(meetingId, "link", {
    title: "Budget sheet",
    url: "https://example.com/budget",
  });
  const imageId = ingestSource(meetingId, "image", {
    title: "Budget chart.png",
    caption: "Bar chart of the Q3 budget split: design 500, ads 1000, remaining 3500.",
    url: sampleChartDataUri(),
  });
  // Tie the prep material to the topic.
  edge(docId, topicId, "mentions");
  edge(imageId, topicId, "mentions");

  // Live conversation between Maya and Tom. Capture ids so we can chain them
  // with `follows` edges (temporal order).
  const u1 = ingestUtterance(meetingId, {
    speaker: "Maya",
    text: "Okay, so for Q3 we have a total budget of 5000 to work with.",
  });
  const u2 = ingestUtterance(meetingId, {
    speaker: "Tom",
    text: "Right. We already spent 500 on the design refresh.",
  });
  const u3 = ingestUtterance(meetingId, {
    speaker: "Maya",
    text: "And another 1000 went to the paid ads campaign last month.",
  });
  const u4 = ingestUtterance(meetingId, {
    speaker: "Tom",
    text: "So that leaves us with 3500 remaining for the rest of the quarter.",
  });
  const u5 = ingestUtterance(meetingId, {
    speaker: "Maya",
    text: "Given that, what should we cut to stay on track?",
  });
  // Temporal chain + anchor the opening line to the topic.
  edge(u1, u2, "follows");
  edge(u2, u3, "follows");
  edge(u3, u4, "follows");
  edge(u4, u5, "follows");
  edge(u1, topicId, "mentions");

  // A chat message that mentions Maya.
  ingestChat(meetingId, {
    speaker: "Tom",
    text: "Maya can you confirm the 3500 figure before we decide?",
    mentions: ["Maya"],
  });

  // Manual Flash invocation: Maya asks for a diagram of the budget. This creates
  // question -> flash_answer -> diagram (+ cites/answers/generated edges), and
  // memory_chunk nodes for the cited sources.
  const questionNodeId = createQuestionNode(
    meetingId,
    "Make a diagram of our budget",
    "Maya",
  );
  applyAgentResponse(meetingId, {
    type: "diagram",
    text: "Here's the budget breakdown grounded in the prep doc and the call.",
    diagramCode:
      'flowchart LR\n  Budget["Budget 5000"] --> Spent["Spent 1500"]\n  Budget --> Left["Remaining 3500"]\n  Spent --> Design["Design 500"]\n  Spent --> Ads["Ads 1000"]\n  Left --> Cont["Contingency 1000"]\n  Left --> Free["Flexible 2500"]',
    sources: ["live: Maya", "doc: Q3 Plan"],
    questionNodeId,
  });

  // Post-meeting finalize: summary + decisions + action items (summary -> ...
  // decided_from / assigned_to edges are created by applyFinalize).
  const { summaryNodeId } = applyFinalize(meetingId, {
    summary:
      "The team reviewed the Q3 budget of 5000: 500 spent on design and 1000 on ads, leaving 3500. They discussed what to cut to stay on track.",
    decisions: [
      "Pause additional paid ads spend until performance is reviewed.",
      "Reserve 1000 of the remaining 3500 as contingency.",
    ],
    actionItems: [
      "Maya to confirm the 3500 remaining figure against the budget sheet.",
      "Tom to draft a revised Q3 allocation by next week.",
    ],
  });

  // `summarizes` edges: the summary summarizes the topic and the key utterances.
  if (summaryNodeId) {
    edge(summaryNodeId, topicId, "summarizes");
    edge(summaryNodeId, u1, "summarizes");
    edge(summaryNodeId, u4, "summarizes");
  }
  // Touch the link node so it doesn't dangle (cites from the answer chain).
  edge(linkId, topicId, "mentions");

  return getCanvas(meetingId) ?? ensureCanvas(meetingId);
}
