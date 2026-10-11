import type { PublicLeadForm } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, notFound } from "../../lib/http.js";
import { enquiryLine } from "./alerts.js";
import { intakeLead } from "./intake.js";
import { findPartnerByCode } from "./partners.js";
import { logoPath } from "../files/logo.js";

const MAX_PER_IP_PER_HOUR = 10;

// Kept here too for the "already on file" check.
export { phoneKey, phoneKeySql } from "./intake.js";

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
    // Sent through a partner's QR code: theirs. Else from a client's "recommend us" link: their referral.
    // An unknown or archived code still makes the lead, just not credited.
    const partner = await findPartnerByCode(tx, form.workspace_id, input.p);
    const referrer = partner ? null : await findReferrer(tx, form.workspace_id, input.ref);
    const note = [input.message, input.eventDate ? `Event date: ${input.eventDate}` : null].filter(Boolean).join("\n");
    await intakeLead(
      tx,
      {
        workspaceId: form.workspace_id,
        source: partner ? "partner" : referrer ? "referral" : "enquiry_form",
        via: "enquiry_form",
        fields: {
          name: input.name,
          phone: input.phone,
          email: null,
          city: input.city ?? null,
          venue: null,
          eventType: input.eventType ?? null,
          eventDate: input.eventDate ?? null,
          guestCount: null,
          budget: null,
          requirements: input.message ?? null,
        },
        repeatWindowDays: 1,
        // The form's enquiries go to the owner.
        assignee: { userId: form.owner_id },
        partner,
        referrer,
        activityMeta: {},
        alertDetail: enquiryLine(input, partner ? `via ${partner.name}` : referrer ? `recommended by ${referrer.name}` : null),
        againNote: note || "Sent the enquiry form again",
        againDetail: input.message || enquiryLine(input) || "Sent the enquiry form again",
      },
      new Date(),
    );
  });
  return { received: true };
}
