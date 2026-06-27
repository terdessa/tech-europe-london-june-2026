import type { Response } from "express";
import type { ApiError } from "../../shared/contracts.js";

export const sendError = (res: Response, status: number, message: string): void => {
  const body: ApiError = { ok: false, error: message };
  res.status(status).json(body);
};

export const requireNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

export const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export const nowUnixSeconds = (): number => Math.floor(Date.now() / 1000);

// ARCHITECTURE uses seconds in examples but P1 might send ms. Normalise to seconds.
export const normaliseTs = (ts: unknown): number => {
  if (!isFiniteNumber(ts)) return nowUnixSeconds();
  return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
};
