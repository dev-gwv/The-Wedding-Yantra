import { ANNIVERSARY_DAYS_AHEAD, can, type BroadcastAudience } from "@wedding-yantra/core";
import type { Broadcast, BroadcastAudiencePreview, BroadcastDetail, BroadcastRecipient } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

const requireManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "clients.manage")) throw forbidden("Only the owner or a manager can send messages to clients");
};

interface PersonRow {
  client_id: string | null;
  lead_id: string | null;
  name: string;
  phone: string;
}

const TODAY = `(SELECT (now() AT TIME ZONE timezone)::date FROM workspaces WHERE id = $1)`;
const CLIENT_OK = `c.workspace_id = $1 AND c.deleted_at IS NULL AND c.phone IS NOT NULL AND NOT c.no_messages`;

/**
 * Who each audience means, as rows of (client_id, lead_id, name, phone), one per phone.
 * Clients who asked for no messages are always left out.
 */
const AUDIENCE_SQL: Record<BroadcastAudience, string> = {
  all_clients: `
    SELECT c.id AS client_id, NULL::uuid AS lead_id, c.name, c.phone FROM clients c
     WHERE ${CLIENT_OK}
     ORDER BY c.name, c.created_at`,
  // Their event is done, or its last day has passed.
  past_clients: `
    SELECT c.id AS client_id, NULL::uuid AS lead_id, c.name, c.phone FROM clients c
     WHERE ${CLIENT_OK}
       AND EXISTS (
         SELECT 1 FROM events e
          WHERE e.client_id = c.id AND e.deleted_at IS NULL AND e.status <> 'cancelled'
            AND (e.status = 'completed' OR (SELECT max(f.date) FROM event_functions f WHERE f.event_id = e.id) < ${TODAY}))
     ORDER BY c.name, c.created_at`,
  // Marked lost in the last year, and not a client since (they may have booked something else).
  lost_enquiries: `
    SELECT client_id, lead_id, name, phone FROM (
      SELECT DISTINCT ON (l.phone) NULL::uuid AS client_id, l.id AS lead_id, l.name, l.phone
        FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
       WHERE l.workspace_id = $1 AND l.deleted_at IS NULL AND s.kind = 'lost' AND l.phone IS NOT NULL
         AND l.stage_changed_at > now() - interval '12 months'
         AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.workspace_id = $1 AND c.phone = l.phone AND c.deleted_at IS NULL)
       ORDER BY l.phone, l.stage_changed_at DESC
    ) lost ORDER BY name`,
  // A wedding function in an earlier year whose day falls in the next two weeks.
  anniversaries: `
    SELECT client_id, lead_id, name, phone FROM (
      SELECT DISTINCT ON (c.id) c.id AS client_id, NULL::uuid AS lead_id, c.name, c.phone, f.date
        FROM clients c
        JOIN events e ON e.client_id = c.id AND e.deleted_at IS NULL AND e.status <> 'cancelled'
        JOIN event_functions f ON f.event_id = e.id
       WHERE ${CLIENT_OK}
         AND ((lower(f.name) LIKE '%wedding%' AND lower(f.name) NOT LIKE '%pre%') OR lower(trim(f.name)) IN ('shaadi', 'marriage', 'pheras', 'phere'))
         AND extract(year FROM f.date) < extract(year FROM ${TODAY})
         AND to_char(f.date, 'MM-DD') IN (SELECT to_char(${TODAY} + g, 'MM-DD') FROM generate_series(0, ${ANNIVERSARY_DAYS_AHEAD - 1}) g)
       ORDER BY c.id, f.date DESC
    ) a ORDER BY to_char(date, 'MM-DD'), name`,
};

const audienceRows = async (db: Queryable, workspaceId: string, audience: BroadcastAudience) =>
  (await db.query<PersonRow>(AUDIENCE_SQL[audience], [workspaceId])).rows;

export async function previewAudience(db: Queryable, ctx: MemberContext, audience: BroadcastAudience): Promise<BroadcastAudiencePreview> {
  requireManage(ctx);
  const rows = await audienceRows(db, ctx.workspaceId, audience);
  return { audience, count: rows.length, names: rows.slice(0, 5).map((r) => r.name.trim().split(/\s+/)[0] ?? r.name) };
}

interface BroadcastRow {
  id: string;
  title: string;
  message: string;
  audience: BroadcastAudience;
  total: string;
  sent: string;
  skipped: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: Date;
}

const SELECT = `
  SELECT b.id, b.title, b.message, b.audience, b.created_by, u.name AS created_by_name, b.created_at,
         (SELECT count(*) FROM broadcast_recipients r WHERE r.broadcast_id = b.id) AS total,
         (SELECT count(*) FROM broadcast_recipients r WHERE r.broadcast_id = b.id AND r.sent_at IS NOT NULL) AS sent,
         (SELECT count(*) FROM broadcast_recipients r WHERE r.broadcast_id = b.id AND r.skipped_at IS NOT NULL) AS skipped
    FROM broadcasts b
    LEFT JOIN users u ON u.id = b.created_by`;

const toBroadcast = (r: BroadcastRow): Broadcast => ({
  id: r.id,
  title: r.title,
  message: r.message,
  audience: r.audience,
  counts: { total: Number(r.total), sent: Number(r.sent), skipped: Number(r.skipped) },
  createdBy: r.created_by ? { id: r.created_by, name: r.created_by_name } : null,
  createdAt: r.created_at.toISOString(),
});

export async function listBroadcasts(db: Queryable, ctx: MemberContext): Promise<Broadcast[]> {
  requireManage(ctx);
  const { rows } = await db.query<BroadcastRow>(`${SELECT} WHERE b.workspace_id = $1 AND b.deleted_at IS NULL ORDER BY b.created_at DESC LIMIT 100`, [
    ctx.workspaceId,
  ]);
  return rows.map(toBroadcast);
}

export async function getBroadcast(db: Queryable, ctx: MemberContext, id: string): Promise<BroadcastDetail> {
  requireManage(ctx);
  const { rows } = await db.query<BroadcastRow>(`${SELECT} WHERE b.id = $1 AND b.workspace_id = $2 AND b.deleted_at IS NULL`, [id, ctx.workspaceId]);
  if (!rows[0]) throw notFound("This message");
  const people = await db.query<{
    id: string;
    name: string;
    phone: string;
    client_id: string | null;
    lead_id: string | null;
    sent_at: Date | null;
    skipped_at: Date | null;
  }>(`SELECT id, name, phone, client_id, lead_id, sent_at, skipped_at FROM broadcast_recipients WHERE broadcast_id = $1 ORDER BY position`, [id]);
  return {
    ...toBroadcast(rows[0]),
    recipients: people.rows.map(
      (r): BroadcastRecipient => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        clientId: r.client_id,
        leadId: r.lead_id,
        sentAt: r.sent_at?.toISOString() ?? null,
        skippedAt: r.skipped_at?.toISOString() ?? null,
      }),
    ),
  };
}

/** Makes the message and fixes its list of people as it is right now. */
export async function createBroadcast(
  db: Db,
  ctx: MemberContext,
  input: { title: string; message: string; audience: BroadcastAudience },
): Promise<BroadcastDetail> {
  requireManage(ctx);
  const id = await withTransaction(db, async (tx) => {
    const people = await audienceRows(tx, ctx.workspaceId, input.audience);
    if (!people.length) throw new AppError(409, "NOBODY_TO_SEND", "Nobody fits this list yet. Pick another, or add clients with a mobile number.");
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO broadcasts (workspace_id, title, message, audience, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ctx.workspaceId, input.title, input.message, input.audience, ctx.userId],
    );
    const broadcastId = rows[0]!.id;
    await tx.query(
      `INSERT INTO broadcast_recipients (broadcast_id, client_id, lead_id, name, phone, position)
       SELECT $1, p.client_id, p.lead_id, p.name, p.phone, p.position
         FROM jsonb_to_recordset($2::jsonb) AS p(client_id uuid, lead_id uuid, name text, phone text, position int)
       ON CONFLICT (broadcast_id, phone) DO NOTHING`,
      [broadcastId, JSON.stringify(people.map((p, position) => ({ ...p, position })))],
    );
    return broadcastId;
  });
  return getBroadcast(db, ctx, id);
}

/** Ticks one person off as sent or skipped, or puts them back. Can also stop all future messages to a client. */
export async function markRecipient(
  db: Db,
  ctx: MemberContext,
  broadcastId: string,
  recipientId: string,
  input: { status: "sent" | "skipped" | "pending"; noMoreMessages?: boolean },
): Promise<BroadcastRecipient> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ client_id: string | null }>(
      `SELECT r.client_id FROM broadcast_recipients r
         JOIN broadcasts b ON b.id = r.broadcast_id
        WHERE r.id = $1 AND r.broadcast_id = $2 AND b.workspace_id = $3 AND b.deleted_at IS NULL
        FOR UPDATE OF r`,
      [recipientId, broadcastId, ctx.workspaceId],
    );
    if (!rows[0]) throw notFound("This person");
    if (input.noMoreMessages) {
      if (!rows[0].client_id) throw new AppError(400, "NOT_A_CLIENT", "Only clients can be left out of future messages");
      await tx.query(`UPDATE clients SET no_messages = true WHERE id = $1`, [rows[0].client_id]);
    }
    const updated = await tx.query<{
      id: string;
      name: string;
      phone: string;
      client_id: string | null;
      lead_id: string | null;
      sent_at: Date | null;
      skipped_at: Date | null;
    }>(
      `UPDATE broadcast_recipients
          SET sent_at = CASE WHEN $2 = 'sent' THEN coalesce(sent_at, now()) END,
              sent_by = CASE WHEN $2 = 'sent' THEN coalesce(sent_by, $3::uuid) END,
              skipped_at = CASE WHEN $2 = 'skipped' THEN coalesce(skipped_at, now()) END
        WHERE id = $1
        RETURNING id, name, phone, client_id, lead_id, sent_at, skipped_at`,
      [recipientId, input.status, ctx.userId],
    );
    const r = updated.rows[0]!;
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      clientId: r.client_id,
      leadId: r.lead_id,
      sentAt: r.sent_at?.toISOString() ?? null,
      skippedAt: r.skipped_at?.toISOString() ?? null,
    };
  });
}

export async function deleteBroadcast(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireManage(ctx);
  const result = await db.query(`UPDATE broadcasts SET deleted_at = now() WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [id, ctx.workspaceId]);
  if (!result.rowCount) throw notFound("This message");
}
