import { formatDate } from "./dates.js";

export interface TemplateValues {
  /** The lead's or client's full name */
  name?: string | null;
  business?: string | null;
  /** YYYY-MM-DD */
  eventDate?: string | null;
  /** The person sending the message */
  myName?: string | null;
}

/** Placeholders people can use in WhatsApp quick replies. */
export const TEMPLATE_PLACEHOLDERS = [
  { token: "{first_name}", label: "Their first name" },
  { token: "{name}", label: "Their full name" },
  { token: "{event_date}", label: "Event date" },
  { token: "{business}", label: "Your business name" },
  { token: "{my_name}", label: "Your name" },
] as const;

/**
 * Fills a quick reply with the lead's details. Unknown values become sensible words
 * instead of leaving "{event_date}" in a message to a client.
 */
export function renderTemplate(body: string, values: TemplateValues): string {
  const full = (values.name ?? "").trim();
  const first = full.split(/\s+/)[0] ?? "";
  const map: Record<string, string> = {
    "{name}": full || "there",
    "{first_name}": first || "there",
    "{business}": values.business?.trim() || "us",
    "{event_date}": values.eventDate ? formatDate(values.eventDate) : "your event date",
    "{my_name}": values.myName?.trim() || "",
  };
  return body.replace(/\{(name|first_name|business|event_date|my_name)\}/g, (token) => map[token] ?? token);
}
