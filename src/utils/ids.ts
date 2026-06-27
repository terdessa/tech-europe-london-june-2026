import { randomBytes } from "node:crypto";

const short = (): string => randomBytes(6).toString("base64url");

export const newUtteranceId = (): string => `utt_${short()}`;
export const newSourceId = (): string => `src_${short()}`;
export const newChunkId = (): string => `chunk_${short()}`;
