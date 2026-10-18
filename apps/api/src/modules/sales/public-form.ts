import { formatDate, whatsappLink } from "@wedding-yantra/core";
import { EVENT_LABELS, type AfterSubmit, type FormField, type PublicLeadForm, type SubmitLeadFormResult, type submitLeadFormInput } from "@wedding-yantra/types";
import type { z } from "zod";
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
  fields: FormField[];
  after_submit: AfterSubmit;
  whatsapp_phone: string | null;
  whatsapp_text: string | null;
  redirect_url: string | null;
  /** The business profile's number, else the owner's */
  default_phone: string | null;
}

async function loadForm(db: Db, slug: string): Promise<FormRow> {
  const { rows } = await db.query<FormRow>(
    `SELECT f.workspace_id, w.name, w.city, bt.name AS business_type_name, bt.icon AS business_type_icon, w.logo_file_id,
            f.fields, f.after_submit, f.whatsapp_phone, f.whatsapp_text, f.redirect_url,
            o.user_id AS owner_id, coalesce(nullif(w.phone, ''), o.phone) AS default_phone
       FROM lead_forms f
       JOIN workspaces w ON w.id = f.workspace_id AND w.deleted_at IS NULL
       JOIN business_types bt ON bt.id = w.business_type_id
       LEFT JOIN LATERAL (SELECT m.user_id, u.phone FROM memberships m JOIN users u ON u.id = m.user_id
                           WHERE m.workspace_id = w.id AND m.role = 'owner' AND m.removed_at IS NULL
                           ORDER BY m.created_at LIMIT 1) o ON true
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
    fields: f.fields,
    services: f.fields.some((x) => x.key === "services") ? await serviceChoices(db, f.workspace_id) : [],
    goesTo: redirectFor(f, null) ? (f.after_submit === "link" ? "link" : "whatsapp") : null,
  };
}

/** "What they need": the business's own service categories, in its order. */
async function serviceChoices(db: Queryable, workspaceId: string): Promise<string[]> {
  const { rows } = await db.query<{ label: string }>(
    `SELECT label FROM custom_options WHERE workspace_id = $1 AND list = 'service_category' AND archived_at IS NULL ORDER BY position, label`,
    [workspaceId],
  );
  return rows.map((r) => r.label);
}

type Submitted = z.output<typeof submitLeadFormInput>;

/**
 * Where they go after sending: a WhatsApp chat with the business, with their enquiry typed in
 * so one tap sends it; or the business's own link. Null for a plain thank-you.
 */
function redirectFor(f: FormRow, input: Submitted | null): string | null {
  if (f.after_submit === "link") return f.redirect_url;
  if (f.after_submit !== "whatsapp") return null;
  const phone = f.whatsapp_phone || f.default_phone;
  if (!phone) return null;
  if (!input) return "whatsapp";
  const event = [input.eventType ? EVENT_LABELS[input.eventType] : null, input.eventDate ? formatDate(input.eventDate) : null].filter(Boolean).join(", ");
  const lines = [
    f.whatsapp_text?.trim() || `Hi ${f.name}! I just sent you an enquiry.`,
    "",
    `Name: ${input.name}`,
    event ? `Event: ${event}` : null,
    input.city ? `City: ${input.city}` : null,
    input.services?.length ? `Looking for: ${input.services.join(", ")}` : null,
    input.guests ? `Guests: ${input.guests}` : null,
  ].filter((l): l is string => l !== null);
  return whatsappLink(lines.join("\n"), phone);
}

const FIELD_NAMES: Record<FormField["key"], keyof Submitted> = {
  email: "email",
  event_type: "eventType",
  event_date: "eventDate",
  city: "city",
  services: "services",
  guests: "guests",
  budget: "budget",
  message: "message",
};

/** Only the questions the form asks count, and the required ones must be answered. */
function checkAnswers(f: FormRow, input: Submitted, services: string[]): Submitted {
  const asked = new Map(f.fields.map((x) => [x.key, x]));
  const out: Submitted = { ...input };
  const missing: Record<string, string> = {};
  for (const [key, name] of Object.entries(FIELD_NAMES) as [FormField["key"], keyof Submitted][]) {
    const field = asked.get(key);
    if (!field) {
      delete out[name];
      continue;
    }
    const v = out[name];
    if (field.required && (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)))
      missing[name] = key === "services" ? "Tick at least one" : "Please fill this in";
  }
  // Only the business's own choices; anything else typed in is dropped.
  if (out.services) {
    const known = new Map(services.map((x) => [x.toLowerCase(), x]));
    out.services = [...new Set(out.services.map((x) => known.get(x.toLowerCase())).filter((x): x is string => !!x))];
    if (asked.get("services")?.required && out.services.length === 0) missing.services = "Tick at least one";
  }
  if (Object.keys(missing).length) throw new AppError(400, "VALIDATION_ERROR", "Please fill in the highlighted fields", missing);
  return out;
}

/**
 * Turns a public enquiry into a lead for the owner. The same number enquiring again
 * within a day adds a note to the open lead instead of creating a duplicate.
 */
export async function submitPublicForm(
  db: Db,
  slug: string,
  ip: string,
  submitted: Submitted,
): Promise<SubmitLeadFormResult> {
  const form = await loadForm(db, slug);
  // Bots fill the hidden field. Pretend it worked so they don't retry.
  if (submitted.website) return { received: true, redirectUrl: null };
  const input = checkAnswers(form, submitted, form.fields.some((x) => x.key === "services") ? await serviceChoices(db, form.workspace_id) : []);
  const said = [input.services?.length ? `Looking for: ${input.services.join(", ")}` : null, input.message].filter(Boolean).join("\n") || null;

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
    const note = [said, input.eventDate ? `Event date: ${input.eventDate}` : null].filter(Boolean).join("\n");
    await intakeLead(
      tx,
      {
        workspaceId: form.workspace_id,
        source: partner ? "partner" : referrer ? "referral" : "enquiry_form",
        via: "enquiry_form",
        fields: {
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          city: input.city ?? null,
          venue: null,
          eventType: input.eventType ?? null,
          eventDate: input.eventDate ?? null,
          guestCount: input.guests ?? null,
          budget: input.budget ?? null,
          requirements: said,
        },
        repeatWindowDays: 1,
        // The form's enquiries go to the owner.
        assignee: { userId: form.owner_id },
        partner,
        referrer,
        activityMeta: {},
        alertDetail: enquiryLine(input, partner ? `via ${partner.name}` : referrer ? `recommended by ${referrer.name}` : null),
        againNote: note || "Sent the enquiry form again",
        againDetail: said || enquiryLine(input) || "Sent the enquiry form again",
      },
      new Date(),
    );
  });
  return { received: true, redirectUrl: redirectFor(form, input) };
}
