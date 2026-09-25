import { z } from "zod";

export interface ApiError {
  code: string;
  message: string;
  /** Field-level problems, keyed by field name, when the request body was invalid. */
  fields?: Record<string, string>;
}

export type ApiResponse<T> =
  | { success: true; data: T; timestamp: string }
  | { success: false; error: ApiError; timestamp: string };

export type HealthStatus = "ok" | "degraded";

export interface SystemHealth {
  status: HealthStatus;
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  database: {
    status: "up" | "down";
    latencyMs: number | null;
  };
}

export const uuid = z.uuid();

/** Trimmed text; empty strings become `null` so optional fields clear cleanly. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
