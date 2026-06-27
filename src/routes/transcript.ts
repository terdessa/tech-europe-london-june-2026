// GET /transcript — P3/P4 ▶ P2. Full ordered transcript for the meeting.
// Powers P3's post-meeting /finalize and P4's post-meeting Q&A.

import type { Request, Response } from "express";
import type { TranscriptResponse } from "../../shared/contracts.js";
import { listUtterances } from "../db.js";
import { requireNonEmptyString, sendError } from "../utils/validation.js";

export const handleTranscript = (req: Request, res: Response): void => {
  const meetingId = req.query["meetingId"];
  if (!requireNonEmptyString(meetingId)) {
    sendError(res, 400, "meetingId is required");
    return;
  }
  const rows = listUtterances(meetingId);
  const out: TranscriptResponse = {
    utterances: rows.map((r) => ({
      speaker: r.speaker ?? undefined,
      ts: r.ts,
      text: r.text,
    })),
  };
  res.json(out);
};
