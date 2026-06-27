// Flash P4 — demo graph builder.
//
// Produces a realistic budget-planning meeting graph for the on-stage demo
// (CLAUDE.md "Demo": "we have 5,000 budget — spent 500 on X, 1,000 on Y").
// Built entirely through the ingest helpers so speaker/said/source/cite edges are
// created the same way as live events. Idempotent: resetCanvas first.

import type { Canvas } from "./canvasTypes";
import { resetCanvas, getCanvas, ensureCanvas } from "./canvasStore";
import {
  ingestUtterance,
  ingestChat,
  ingestSource,
  createQuestionNode,
  applyAgentResponse,
  applyFinalize,
} from "./eventIngest";

export function buildDemoGraph(meetingId: string): Canvas {
  resetCanvas(meetingId);

  // Prep docs / links shared before the meeting.
  ingestSource(meetingId, "document", {
    title: "Q3 Plan",
    content:
      "Q3 marketing plan. Total budget 5000. Targets: design refresh, paid ads, contingency.",
  });
  ingestSource(meetingId, "link", {
    title: "Budget sheet",
    url: "https://example.com/budget",
  });

  // Live conversation between Maya and Tom.
  ingestUtterance(meetingId, {
    speaker: "Maya",
    text: "Okay, so for Q3 we have a total budget of 5000 to work with.",
  });
  ingestUtterance(meetingId, {
    speaker: "Tom",
    text: "Right. We already spent 500 on the design refresh.",
  });
  ingestUtterance(meetingId, {
    speaker: "Maya",
    text: "And another 1000 went to the paid ads campaign last month.",
  });
  ingestUtterance(meetingId, {
    speaker: "Tom",
    text: "So that leaves us with 3500 remaining for the rest of the quarter.",
  });
  ingestUtterance(meetingId, {
    speaker: "Maya",
    text: "Given that, what should we cut to stay on track?",
  });

  // A chat message that mentions Maya.
  ingestChat(meetingId, {
    speaker: "Tom",
    text: "Maya can you confirm the 3500 figure before we decide?",
    mentions: ["Maya"],
  });

  // Manual Flash invocation: Maya asks for a diagram of the budget.
  const questionNodeId = createQuestionNode(
    meetingId,
    "Make a diagram of our budget",
    "Maya",
  );
  applyAgentResponse(meetingId, {
    type: "diagram",
    text: "Budget breakdown",
    diagramCode:
      'flowchart TD\n  Budget["Budget 5000"] --> Design["Design 500"]\n  Budget --> Ads["Ads 1000"]\n  Budget --> Left["Remaining 3500"]',
    sources: ["live: Maya", "doc: Q3 Plan"],
    questionNodeId,
  });

  // Post-meeting finalize: summary + decisions + action items.
  applyFinalize(meetingId, {
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

  return getCanvas(meetingId) ?? ensureCanvas(meetingId);
}
