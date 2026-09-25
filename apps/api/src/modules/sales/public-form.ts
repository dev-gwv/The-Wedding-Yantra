import type { PublicLeadForm } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, notFound } from "../../lib/http.js";
import { firstOpenStage } from "./leads.js";

const MAX_PER_IP_PER_HOUR = 10;

interface FormRow {
  workspace_id: string;
  name: string;
  city: string;
  business_type_name: string;
  business_type_icon: string;
  owner_id: string | null;
}

async function loadForm(db: Db, slug: string): Promise<FormRow> {
  const { rows } = await db.query<FormRow>(
    `SELECT f.workspace_id, w.name, w.city, bt.name AS business_type_name, bt.icon AS business_type_icon,
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

export async function getPublicForm(db: Db, slug: string, ref?: string): Promise<PublicLeadForm> {
  const f = await loadForm(db, slug);
  const referrer = await findReferrer(db, f.workspace_id, ref);
  return {
    businessName: f.name,
    businessTypeName: f.business_type_name,
    businessTypeIcon: f.business_type_icon,
    city: f.city,
    // Only the first name: the link travels between friends.
    referrer: referrer ? (referrer.name.trim().split(/\s+/)[0] ?? null) : null,
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

    const existing = await tx.query<{ id: string }>(
      `SELECT l.id FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
        WHERE l.workspace_id = $1 AND l.phone = $2 AND l.deleted_at IS NULL AND s.kind = 'open'
          AND l.created_at > now() - interval '1 day'
        ORDER BY l.created_at DESC LIMIT 1`,
      [form.workspace_id, input.phone],
    );
    if (existing.rows[0]) {
      await tx.query(
        `INSERT INTO lead_activities (workspace_id, lead_id, kind, body, meta) VALUES ($1, $2, 'note', $3, $4)`,
        [form.workspace_id, existing.rows[0].id, note || "Sent the enquiry form again", { via: "enquiry_form" }],
      );
      return;
    }

    // Sent from a client's "recommend us" link: it's their referral.
    const referrer = await findReferrer(tx, form.workspace_id, input.ref);
    const stage = await firstOpenStage(tx, form.workspace_id);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO leads (workspace_id, stage_id, name, phone, event_type, event_date, city, requirements,
                          source, referred_by, referred_by_client_id, assigned_to, next_follow_up_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
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
        referrer ? "referral" : "enquiry_form",
        referrer?.name ?? null,
        referrer?.id ?? null,
        form.owner_id,
      ],
    );
    await tx.query(
      `INSERT INTO lead_activities (workspace_id, lead_id, kind, meta) VALUES ($1, $2, 'created', $3)`,
      [
        form.workspace_id,
        rows[0]!.id,
        referrer ? { source: "referral", via: "enquiry_form", referrer: referrer.name } : { source: "enquiry_form" },
      ],
    );
    // A form enquiry wants a reply the same day: that's its first follow-up.
    await tx.query(
      `INSERT INTO lead_activities (workspace_id, lead_id, kind, meta) VALUES ($1, $2, 'follow_up_set', jsonb_build_object('at', now()))`,
      [form.workspace_id, rows[0]!.id],
    );
  });
  return { received: true };
}
