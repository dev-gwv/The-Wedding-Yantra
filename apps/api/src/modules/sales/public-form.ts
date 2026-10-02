import type { PublicLeadForm } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, notFound } from "../../lib/http.js";
import { enquiryLine, salesAlert } from "./alerts.js";
import { firstOpenStage } from "./leads.js";
import { findPartnerByCode } from "./partners.js";
import { logoPath } from "../files/logo.js";

const MAX_PER_IP_PER_HOUR = 10;

/**
 * The last 10 digits of a number: how a repeat enquiry finds its lead, and how the
 * "already on file" check matches, whether it was typed with +91, a 0 or spaces.
 */
export const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-10);
/** The same, worked out in SQL on a phone column. */
export const phoneKeySql = (column: string) => `right(regexp_replace(${column}, '\\D', '', 'g'), 10)`;

interface FormRow {
  workspace_id: string;
  name: string;
  city: string;
  business_type_name: string;
  business_type_icon: string;
  logo_file_id: string | null;
  owner_id: string | null;
}

async function loadForm(db: Db, slug: string): Promise<FormRow> {
  const { rows } = await db.query<FormRow>(
    `SELECT f.workspace_id, w.name, w.city, bt.name AS business_type_name, bt.icon AS business_type_icon, w.logo_file_id,
            (SELECT m.user_id FROM memberships m
              WHERE m.workspace_id = w.id AND m.role = 'owner' AND m.removed_at IS NULL) AS owner_id
       FROM lead_forms f
       JOIN workspaces w ON w.id = f.workspace_id AND w.deleted_at IS NULL
       JOIN business_types bt ON bt.id = w.business_type_id
      WHERE f.slug = $1 AND f.enabled`,
    [slug],
  );
  if (!rows[0]) throw notFound("This enquiry form");
  return rows[0];
}

/** The client whose "recommend us" link this is, if the code is theirs. */
async function findReferrer(db: Queryable, workspaceId: string, code: string | undefined) {
  if (!code) return null;
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM clients WHERE workspace_id = $1 AND referral_code = $2 AND deleted_at IS NULL`,
    [workspaceId, code.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function getPublicForm(db: Db, slug: string, ref?: string, partnerCode?: string): Promise<PublicLeadForm> {
  const f = await loadForm(db, slug);
  const referrer = await findReferrer(db, f.workspace_id, ref);
  // Opened through a partner's QR code: count the scan.
  const partner = await findPartnerByCode(db, f.workspace_id, partnerCode);
  if (partner) await db.query(`UPDATE partners SET scans = scans + 1 WHERE id = $1`, [partner.id]);
  return {
    businessName: f.name,
    businessTypeName: f.business_type_name,
    businessTypeIcon: f.business_type_icon,
    city: f.city,
    logoUrl: logoPath(f.workspace_id, f.logo_file_id),
    // Only the first name: the link travels between friends.
    referrer: referrer ? (referrer.name.trim().split(/\s+/)[0] ?? null) : null,
    partner: partner?.name ?? null,
  };
}

/**
 * Turns a public enquiry into a lead for the owner. The same number enquiring again
 * within a day adds a note to the open lead instead of creating a duplicate.
 */
export async function submitPublicForm(
  db: Db,
  slug: string,
  ip: string,
  input: {
    name: string;
    phone: string;
    eventType?: string | null;
    eventDate?: string | null;
    city?: string | null;
    message?: string | null;
    website?: string;
    ref?: string;
    p?: string;
  },
): Promise<{ received: true }> {
  const form = await loadForm(db, slug);
  // Bots fill the hidden field. Pretend it worked so they don't retry.
  if (input.website) return { received: true };

  const recent = await db.query<{ n: string }>(
    `SELECT count(*) AS n FROM lead_form_submissions WHERE ip = $1 AND created_at > now() - interval '1 hour'`,
    [ip],
  );
  if (Number(recent.rows[0]?.n) >= MAX_PER_IP_PER_HOUR) {
    throw new AppError(429, "TOO_MANY_REQUESTS", "Too many enquiries from this device. Please try again later.");
  }

  await withTransaction(db, async (tx) => {
    await tx.query(`INSERT INTO lead_form_submissions (workspace_id, ip) VALUES ($1, $2)`, [form.workspace_id, ip]);
    const note = [input.message, input.eventDate ? `Event date: ${input.eventDate}` : null].filter(Boolean).join("\n");

    const existing = await tx.query<{ id: string; name: string; assigned_to: string | null }>(
      `SELECT l.id, l.name, l.assigned_to FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
        WHERE l.workspace_id = $1 AND ${phoneKeySql("l.phone")} = $2 AND l.deleted_at IS NULL AND s.kind = 'open'
          AND l.created_at > now() - interval '1 day'
        ORDER BY l.created_at DESC LIMIT 1`,
      [form.workspace_id, phoneKey(input.phone)],
    );
    const lead = existing.rows[0];
    if (lead) {
      await tx.query(
        `INSERT INTO lead_activities (workspace_id, lead_id, kind, body, meta) VALUES ($1, $2, 'note', $3, $4)`,
        [form.workspace_id, lead.id, note || "Sent the enquiry form again", { via: "enquiry_form" }],
      );
      // Whoever has the lead hears they asked again, once for this submission.
      await salesAlert(tx, {
        workspaceId: form.workspace_id,
        kind: "lead.new",
        to: [lead.assigned_to],
        facts: { name: lead.name, again: true, detail: input.message || enquiryLine(input) || "Sent the enquiry form again" },
        link: `/app/leads/${lead.id}`,
        entityType: "lead",
        entityId: lead.id,
      });
      return;
    }

    // Sent through a partner's QR code: theirs. Else from a client's "recommend us" link: their referral.
    // An unknown or archived code still makes the lead, just not credited.
    const partner = await findPartnerByCode(tx, form.workspace_id, input.p);
    const referrer = partner ? null : await findReferrer(tx, form.workspace_id, input.ref);
    const stage = await firstOpenStage(tx, form.workspace_id);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO leads (workspace_id, stage_id, name, phone, event_type, event_date, city, requirements,
                          source, referred_by, referred_by_client_id, partner_id, assigned_to, next_follow_up_at, follow_up_alerted_for)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
       RETURNING id`,
      [
        form.workspace_id,
        stage.id,
        input.name,
        input.phone,
        input.eventType ?? null,
        input.eventDate ?? null,
        input.city ?? null,
        input.message ?? null,
        partner ? "partner" : referrer ? "referral" : "enquiry_form",
        partner?.name ?? referrer?.name ?? null,
        referrer?.id ?? null,
        partner?.id ?? null,
        form.owner_id,
      ],
    );
    await tx.query(
      `INSERT INTO lead_activities (workspace_id, lead_id, kind, meta) VALUES ($1, $2, 'created', $3)`,
      [
        form.workspace_id,
        rows[0]!.id,
        partner
          ? { source: "partner", via: "enquiry_form", partner: partner.name }
          : referrer
            ? { source: "referral", via: "enquiry_form", referrer: referrer.name }
            : { source: "enquiry_form" },
      ],
    );
    // A form enquiry wants a reply the same day: that's its first follow-up.
    await tx.query(
      `INSERT INTO lead_activities (workspace_id, lead_id, kind, meta) VALUES ($1, $2, 'follow_up_set', jsonb_build_object('at', now()))`,
      [form.workspace_id, rows[0]!.id],
    );
    // Whoever has it (the owner) hears about it. This also counts as the alert for that first
    // follow-up (`follow_up_alerted_for` above), so the follow-up job doesn't send a second one.
    await salesAlert(tx, {
      workspaceId: form.workspace_id,
      kind: "lead.new",
      to: [form.owner_id],
      facts: {
        name: input.name,
        detail: enquiryLine(input, partner ? `via ${partner.name}` : referrer ? `recommended by ${referrer.name}` : null),
      },
      link: `/app/leads/${rows[0]!.id}`,
      entityType: "lead",
      entityId: rows[0]!.id,
    });
  });
  return { received: true };
}
