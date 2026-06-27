// Lightweight auto-layout so API-created nodes don't pile up at the origin.
// We assign each node type to a vertical "lane" (column) and stack new nodes
// downward within that lane. The user can still drag nodes freely afterwards.

import type { Canvas, CanvasNodeType, XYPosition } from "./canvasTypes";

const LANE_WIDTH = 320;
const ROW_HEIGHT = 150;
const TOP = 40;

// lane index per node type (left -> right reading like a workflow)
const LANE: Record<CanvasNodeType, number> = {
  speaker: 0,
  source: 0,
  document: 1,
  link: 1,
  image: 1,
  memory_chunk: 1,
  utterance: 2,
  chat_context: 2,
  topic: 3,
  question: 3,
  flash_answer: 4,
  diagram: 4,
  decision: 5,
  action_item: 5,
  summary: 6,
};

export function positionFor(canvas: Canvas, nodeType: CanvasNodeType): XYPosition {
  const lane = LANE[nodeType] ?? 3;
  // count existing nodes already in this lane to find the next free row
  const inLane = canvas.nodes.filter(
    (n) => (LANE[n.data.nodeType] ?? 3) === lane,
  ).length;
  return {
    x: 60 + lane * LANE_WIDTH,
    y: TOP + inLane * ROW_HEIGHT,
  };
}
