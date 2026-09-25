import { ApiRequestError } from "@wedding-yantra/api-client";
import type { z } from "zod";

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return "Something went wrong. Please try again.";
}

/** Per-field messages from a failed API call, to show under each input. */
export function apiFieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiRequestError ? error.fields : {};
}

/**
 * Checks a form with the same schema the server uses, so people see the same message
 * instantly instead of after a round trip. Returns field errors, or null when valid.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  values: unknown,
): { data: z.output<S>; errors: null } | { data: null; errors: Record<string, string> } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}
