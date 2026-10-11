import type { LeadSource } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { salesAlert } from "./alerts.js";
import { firstOpenStage } from "./leads.js";
import { pickAssignee } from "./routing.js";

/**
 * The last 10 digits of a number: how a repeat enquiry finds its lead, and how the
 * "already on file" check matches, whether it was typed with +91, a 0 or spaces.
 */
export const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-10);
/** The same, worked out in SQL on a phone column. Written exactly like `leads_phone_key_idx`. */
export const phoneKeySql = (column: string) => `right(regexp_replace(${column}, '\\D', '', 'g'), 10)`;

/** What an enquiry says, already read and cleaned. */
export interface IntakeFields {
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  venue: string | null;
  eventType: string | null;
  /** YYYY-MM-DD */
  eventDate: string | null;
  guestCount: number | null;
  /** Rupees */
  budget: number | null;
  requirements: string | null;
}

export interface IntakeInput {
  workspaceId: string;
  /** Where a new lead says it came from */
  source: LeadSource;
  via: "enquiry_form" | "meta";
  fields: IntakeFields;
  /** The same phone enquiring again within this many days joins its open lead */
  repeatWindowDays: number;
  /**
   * A repeat fills in what the open lead didn't know yet (city, date…). Only for lead forms
   * read from Facebook: the public enquiry form, open to anyone with the number, only adds a note.
   */
  fillBlanks?: boolean;
  /** "routing": the salesperson with the fewest open leads; or one fixed person (the form's owner) */
  assignee: "routing" | { userId: string | null };
  /** A partner's QR code that brought a new lead */
  partner?: { id: string; name: string } | null;
  /** The client whose "recommend us" link brought a new lead (ignored when there's a partner) */
  referrer?: { id: string; name: string } | null;
  /** Added to the meta of the `created` activity (new lead) or the `note` (repeat) */
  activityMeta: Record<string, unknown>;
  /** The line under "New enquiry: <name>": "Wedding · 14 Dec 2026 · Jaipur · Instagram ad" */
  alertDetail: string;
  /** A repeat: the note added to the open lead. "Enquired again" when not given */
  againNote?: string;
  /** A repeat: the line under "Enquired again: <name>". The alert detail when not given */
  againDetail?: string;
  /** One alert per key per person, so a lead brought in twice never buzzes twice */
  dedupeKey?: string;
  /** The incoming_leads row it came from, kept on the activity */
  incomingId?: string;
  /** Meta's test lead */
  isTest?: boolean;
  /** Brought in with several others at once (a catch-up): no alert here, the caller sends one summary */
  quiet?: boolean;
}

export interface IntakeResult {
  leadId: string;
  /** Added to an open lead from the same phone instead of making a new one */
  merged: boolean;
  /** Who has the lead (null only when nobody does) */
  assignedTo: string | null;
}

/**
 * Brings one enquiry into Leads, for the public enquiry form and for Facebook and Instagram
 * lead ads alike. The same phone (last 10 digits) enquiring again within the window joins
 * its open lead: a note, blanks filled in (`fillBlanks`), and an "Enquired again" alert to
 * whoever has it.
 * Otherwise a new lead that wants a reply today, given to `assignee`, who is alerted.
 *
 * `tx` must be a transaction. Throws `NO_STAGES` (409) when the business has no open stage.
 */
export async function intakeLead(tx: Queryable, input: IntakeInput, now: Date): Promise<IntakeResult> {
  const ws = input.workspaceId;
  const f = input.fields;
  const extra = { ...(input.incomingId ? { incomingId: input.incomingId } : {}), ...(input.isTest ? { test: true } : {}) };

  // Two leads without a full number are never the same person.
  const key = f.phone ? phoneKey(f.phone) : "";
  if (key.length === 10) {
    // One at a time per number, so the same person sending twice at once makes one lead.
    await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))`, [ws, key]);
    const existing = await tx.query<{ id: string; name: string; assigned_to: string | null }>(
      `SELECT l.id, l.name, l.assigned_to FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
        WHERE l.workspace_id = $1 AND l.deleted_at IS NULL AND l.phone IS NOT NULL AND ${phoneKeySql("l.phone")} = $2
          AND s.kind = 'open' AND l.created_at > $3::timestamptz - make_interval(days => $4::int)
        ORDER BY l.created_at DESC LIMIT 1`,
      [ws, key, now, input.repeatWindowDays],
    );
    const lead = existing.rows[0];
    if (lead) {
      await tx.query(`INSERT INTO lead_activities (workspace_id, lead_id, kind, body, meta) VALUES ($1, $2, 'note', $3, $4)`, [
        ws,
        lead.id,
        input.againNote || "Enquired again",
        { via: input.via, ...input.activityMeta, ...extra },
      ]);
      // What the lead didn't know yet; nothing already there is changed.
      if (input.fillBlanks) await tx.query(
        `UPDATE leads SET email = coalesce(nullif(email, ''), $3), city = coalesce(nullif(city, ''), $4),
                          venue = coalesce(nullif(venue, ''), $5), event_type = coalesce(nullif(event_type, ''), $6),
                          event_date = coalesce(event_date, $7::date), guest_count = coalesce(guest_count, $8::int),
                          budget = coalesce(budget, $9::numeric), updated_at = now()
          WHERE id = $1 AND workspace_id = $2`,
        [lead.id, ws, f.email, f.city, f.venue, f.eventType, f.eventDate, f.guestCount, f.budget],
      );
      // Whoever has the lead hears they asked again, once for this enquiry.
      if (!input.quiet) await salesAlert(tx, {
        workspaceId: ws,
        kind: "lead.new",
        to: [lead.assigned_to],
        facts: { name: lead.name, again: true, detail: input.againDetail || input.alertDetail || "Enquired again" },
        link: `/app/leads/${lead.id}`,
        entityType: "lead",
        entityId: lead.id,
        dedupeKey: input.dedupeKey ?? null,
      });
      return { leadId: lead.id, merged: true, assignedTo: lead.assigned_to };
    }
  }

  const stage = await firstOpenStage(tx, ws);
  const assignedTo = input.assignee === "routing" ? await pickAssignee(tx, ws, now) : input.assignee.userId;
  // Credited to a partner's QR code first, else to the client who recommended them.
  const partner = input.partner ?? null;
  const referrer = partner ? null : (input.referrer ?? null);
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO leads (workspace_id, stage_id, name, phone, email, event_type, event_date, city, venue, guest_count, budget, requirements,
                        source, referred_by, referred_by_client_id, partner_id, assigned_to, next_follow_up_at, follow_up_alerted_for)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)
     RETURNING id`,
    [
      ws,
      stage.id,
      f.name,
      f.phone,
      f.email,
      f.eventType,
      f.eventDate,
      f.city,
      f.venue,
      f.guestCount,
      f.budget,
      f.requirements,
      input.source,
      partner?.name ?? referrer?.name ?? null,
      referrer?.id ?? null,
      partner?.id ?? null,
      assignedTo,
      now,
    ],
  );
  const leadId = rows[0]!.id;
  const credit = partner ? { partner: partner.name } : referrer ? { referrer: referrer.name } : {};
  await tx.query(`INSERT INTO lead_activities (workspace_id, lead_id, kind, meta) VALUES ($1, $2, 'created', $3)`, [
    ws,
    leadId,
    { source: input.source, via: input.via, ...credit, ...input.activityMeta, ...extra },
  ]);
  // An enquiry wants a reply the same day: that's its first follow-up.
  await tx.query(
    `INSERT INTO lead_activities (workspace_id, lead_id, kind, meta) VALUES ($1, $2, 'follow_up_set', jsonb_build_object('at', $3::timestamptz))`,
    [ws, leadId, now],
  );
  // Whoever has it hears about it. This also counts as the alert for that first follow-up
  // (`follow_up_alerted_for` above), so the follow-up job doesn't send a second one.
  if (!input.quiet) await salesAlert(tx, {
    workspaceId: ws,
    kind: "lead.new",
    to: [assignedTo],
    facts: { name: f.name, detail: input.alertDetail },
    link: `/app/leads/${leadId}`,
    entityType: "lead",
    entityId: leadId,
    dedupeKey: input.dedupeKey ?? null,
  });
  return { leadId, merged: false, assignedTo };
}
