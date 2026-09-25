import type { ApiError, ApiResponse } from "@wedding-yantra/types";
import type { z } from "zod";

export const ok = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  timestamp: new Date().toISOString(),
});

export const fail = (code: string, message: string, fields?: Record<string, string>): ApiResponse<never> => {
  const error: ApiError = { code, message };
  if (fields) error.fields = fields;
  return { success: false, error, timestamp: new Date().toISOString() };
};

/** An error with a message that is safe to show to the person using the app. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "This item") => new AppError(404, "NOT_FOUND", `${what} was not found`);
export const forbidden = (message = "You don't have permission to do this") =>
  new AppError(403, "FORBIDDEN", message);

/** Validates a request body with a shared schema, or throws a 400 with per-field messages. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;

  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    const message =
      issue.code === "invalid_type" && issue.message.includes("received undefined")
        ? "This is required"
        : issue.message;
    fields[key] ??= message;
  }
  const first = Object.values(fields)[0] ?? "Please check the details and try again";
  throw new AppError(400, "VALIDATION_ERROR", first, fields);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects malformed IDs with a clean 404 instead of letting Postgres throw. */
export function assertId(id: string, what: string): string {
  if (!UUID_PATTERN.test(id)) throw notFound(what);
  return id;
}
