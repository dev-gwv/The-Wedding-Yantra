import { z } from "zod";

export const SERVICE_UNITS = ["event", "day", "hour", "plate", "piece", "set", "person"] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export const UNIT_LABELS: Record<ServiceUnit, string> = {
  event: "per event",
  day: "per day",
  hour: "per hour",
  plate: "per plate",
  piece: "per piece",
  set: "per set",
  person: "per person",
};

/** Ready-made setup installed for a new business of this type. Every item can be edited. */
export const starterPack = z.object({
  services: z.array(z.object({ name: z.string(), unit: z.enum(SERVICE_UNITS), price: z.number() })),
  pipelineStages: z.array(z.string()),
  checklist: z.array(z.object({ title: z.string(), when: z.enum(["before", "on_day", "after"]) })),
  kras: z.array(z.object({ role: z.string(), title: z.string() })),
});
export type StarterPack = z.infer<typeof starterPack>;

export const businessType = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
});
export type BusinessType = z.infer<typeof businessType>;
