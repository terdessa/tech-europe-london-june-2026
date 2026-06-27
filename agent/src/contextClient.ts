import * as fs from "fs";
import * as path from "path";
import type { Utterance } from "../../shared/contracts";
import { CONFIG } from "./config";

/**
 * Writes every utterance into the meeting's context file AND posts to P2 (if configured).
 * The local file means "everything said is captured" even before the P2 service exists.
 */
export async function ingest(u: Utterance): Promise<void> {
  appendToContextFile(u);

  if (!CONFIG.contextServiceUrl) return;
  try {
    await fetch(`${CONFIG.contextServiceUrl}/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(u),
    });
  } catch (err) {
    console.warn("[context] /ingest failed, kept local copy:", (err as Error).message);
  }
}

function appendToContextFile(u: Utterance): void {
  const dir = path.resolve(__dirname, "../../data/context");
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, `${u.meetingId}.jsonl`), JSON.stringify(u) + "\n");
}
