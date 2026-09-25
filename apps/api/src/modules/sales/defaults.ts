import { randomBytes } from "node:crypto";
import type { StarterPack } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { DEFAULT_QUOTE_TERMS, installCatalogue } from "../bookings/catalogue.js";

/** The quick replies every business starts with. Same text as migration 0004. */
export const DEFAULT_TEMPLATES = [
  {
    title: "Thank you for your enquiry",
    body: "Hi {first_name}, thank you for contacting {business}! We'd love to be part of your celebration. Could you share your event date and venue?",
  },
  {
    title: "Share our packages",
    body: "Hi {first_name}, here are our packages and prices. Happy to customise one for your event on {event_date}. When is a good time to talk?",
  },
  {
    title: "Check availability",
    body: "Hi {first_name}, good news: we are available on {event_date}. Shall we block the date for you?",
  },
  {
    title: "Gentle follow-up",
    body: "Hi {first_name}, just checking in about your event on {event_date}. Do you have any questions I can help with?",
  },
];

export function stageKind(name: string): "open" | "won" | "lost" {
  const n = name.trim().toLowerCase();
  if (n.startsWith("lost")) return "lost";
  if (n.startsWith("booked")) return "won";
  return "open";
}

/** `Riya Makeup Studio` -> `riya-makeup-studio-3f9a1c`. The random end keeps links unguessable. */
export function formSlug(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const tail = randomBytes(3).toString("hex");
  return base ? `${base}-${tail}` : `studio-${tail}`;
}

/** Gives a new business its sales stages, quick replies and enquiry form. */
export async function installSalesDefaults(
  db: Queryable,
  workspace: { id: string; name: string; starterPack: StarterPack },
): Promise<void> {
  const stages = workspace.starterPack.pipelineStages;
  for (const [i, name] of stages.entries()) {
    await db.query(`INSERT INTO pipeline_stages (workspace_id, name, position, kind) VALUES ($1, $2, $3, $4)`, [
      workspace.id,
      name,
      i,
      stageKind(name),
    ]);
  }
  for (const [i, t] of DEFAULT_TEMPLATES.entries()) {
    await db.query(`INSERT INTO whatsapp_templates (workspace_id, title, body, position) VALUES ($1, $2, $3, $4)`, [
      workspace.id,
      t.title,
      t.body,
      i,
    ]);
  }
  await db.query(`INSERT INTO lead_forms (workspace_id, slug) VALUES ($1, $2)`, [workspace.id, formSlug(workspace.name)]);
  await installCatalogue(db, workspace.id, workspace.starterPack.services);
  await db.query(`UPDATE workspaces SET quote_terms = $2 WHERE id = $1`, [workspace.id, DEFAULT_QUOTE_TERMS]);
}
