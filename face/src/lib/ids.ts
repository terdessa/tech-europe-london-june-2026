// Monotonic, process-local id generator. Deterministic enough for a demo and
// avoids Math.random / Date.now collisions when many nodes are created in a tick.

let seq = 0;

function nextSeq(): number {
  seq += 1;
  return seq;
}

export function newNodeId(prefix = "n"): string {
  return `${prefix}_${nextSeq().toString(36)}`;
}

export function newEdgeId(): string {
  return `e_${nextSeq().toString(36)}`;
}
