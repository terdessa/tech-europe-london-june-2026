// GET /meetings — P4 ▶ P2. List previous meetings for the dashboard history.
// One summary row per meetingId (latest first). No required query params.

import type { Request, Response } from "express";
import type { MeetingsResponse } from "../../shared/contracts.js";
import { listMeetings } from "../db.js";
import { sendError } from "../utils/validation.js";

export const handleMeetings = (_req: Request, res: Response): void => {
  try {
    const out: MeetingsResponse = { meetings: listMeetings() };
    res.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendError(res, 500, msg);
  }
};
