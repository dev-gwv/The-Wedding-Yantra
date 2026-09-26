/**
 * Custom fields: each business adds its own details to enquiries, clients and events,
 * like "Skin type" for a makeup artist or "Power needed" for sound and light. The API
 * checks every value with these rules; the apps use them to show and fill the fields.
 */
import { formatDate } from "./dates.js";

export const CUSTOM_FIELD_ENTITIES = ["lead", "client", "event", "task"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];
export const CUSTOM_FIELD_ENTITY_LABELS: Record<CustomFieldEntity, string> = { lead: "Enquiries", client: "Clients", event: "Events", task: "Tasks" };

export const CUSTOM_FIELD_KINDS = ["text", "number", "date", "choice", "yes_no"] as const;
export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];
export const CUSTOM_FIELD_KIND_LABELS: Record<CustomFieldKind, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  choice: "Pick from a list",
  yes_no: "Yes or no",
};

export type CustomValue = string | number | boolean | null;
export type CustomValues = Record<string, CustomValue>;

export interface CustomFieldDef {
  id: string;
  label: string;
  kind: CustomFieldKind;
  /** For "choice" */
  options: string[];
}

/** One value, cleaned: empty becomes null. Unknown kinds or bad values give a plain error. */
export function checkCustomValue(field: CustomFieldDef, raw: unknown): { value: CustomValue } | { error: string } {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { value: null };
  switch (field.kind) {
    case "text": {
      if (typeof raw !== "string" && typeof raw !== "number") return { error: "Enter some text" };
      const text = String(raw).trim();
      return text.length > 500 ? { error: "Keep it under 500 characters" } : { value: text };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/,/g, "")) : NaN;
      return Number.isFinite(n) && Math.abs(n) < 1e12 ? { value: n } : { error: "Enter a number" };
    }
    case "date":
      return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? { value: raw } : { error: "Pick a date" };
    case "choice":
      return typeof raw === "string" && field.options.includes(raw) ? { value: raw } : { error: "Pick one from the list" };
    case "yes_no":
      if (typeof raw === "boolean") return { value: raw };
      if (raw === "true" || raw === "false") return { value: raw === "true" };
      return { error: "Choose yes or no" };
  }
}

/** A value as people read it: "15 Nov 2026", "Yes", "1,20,000". Null for nothing to show. */
export function formatCustomValue(field: CustomFieldDef, value: CustomValue | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (field.kind === "yes_no") return value === true ? "Yes" : value === false ? "No" : null;
  if (field.kind === "date" && typeof value === "string") return formatDate(value);
  if (field.kind === "number" && typeof value === "number") return value.toLocaleString("en-IN");
  return String(value);
}

export interface CustomFieldSuggestion {
  entity: CustomFieldEntity;
  label: string;
  kind: CustomFieldKind;
  options?: string[];
}

/** Details each trade usually asks for, one tap to add. */
export const CUSTOM_FIELD_SUGGESTIONS: Record<string, CustomFieldSuggestion[]> = {
  makeup_artist: [
    { entity: "lead", label: "Skin type", kind: "choice", options: ["Dry", "Oily", "Combination", "Sensitive", "Normal"] },
    { entity: "lead", label: "Trial wanted", kind: "yes_no" },
    { entity: "client", label: "Allergies", kind: "text" },
    { entity: "event", label: "People getting ready", kind: "number" },
  ],
  mehendi_artist: [
    { entity: "lead", label: "Design style", kind: "choice", options: ["Rajasthani", "Arabic", "Indo-Arabic", "Minimal"] },
    { entity: "event", label: "Guests for mehendi", kind: "number" },
  ],
  photographer: [
    { entity: "lead", label: "Wants a film too", kind: "yes_no" },
    { entity: "event", label: "Drone allowed at venue", kind: "yes_no" },
    { entity: "event", label: "Album size", kind: "choice", options: ["12x36", "12x30", "10x30", "No album"] },
  ],
  content_creator: [{ entity: "lead", label: "Instagram handle", kind: "text" }],
  decorator: [
    { entity: "lead", label: "Theme", kind: "text" },
    { entity: "event", label: "Setup access from", kind: "text" },
    { entity: "event", label: "Indoor or outdoor", kind: "choice", options: ["Indoor", "Outdoor", "Both"] },
  ],
  event_decorator: [{ entity: "lead", label: "Theme", kind: "text" }],
  sound_lighting: [
    { entity: "event", label: "Power needed (kW)", kind: "number" },
    { entity: "event", label: "Generator at venue", kind: "yes_no" },
  ],
  caterer: [
    { entity: "lead", label: "Food preference", kind: "choice", options: ["Veg", "Non-veg", "Jain", "Mixed"] },
    { entity: "event", label: "Plates confirmed", kind: "number" },
  ],
  bar_services: [
    { entity: "event", label: "Licence arranged", kind: "yes_no" },
    { entity: "event", label: "Bartenders needed", kind: "number" },
  ],
  wedding_planner: [
    { entity: "lead", label: "Guest count", kind: "number" },
    { entity: "lead", label: "Destination wedding", kind: "yes_no" },
  ],
  gifting: [{ entity: "lead", label: "Hampers needed", kind: "number" }],
  choreographer: [{ entity: "event", label: "Performers", kind: "number" }],
  fireworks: [{ entity: "event", label: "Permission taken", kind: "yes_no" }],
};

export const customFieldSuggestions = (businessTypeId: string): CustomFieldSuggestion[] => CUSTOM_FIELD_SUGGESTIONS[businessTypeId] ?? [];
