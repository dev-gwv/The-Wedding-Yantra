import { can, eventIsOver } from "@wedding-yantra/core";
import type { GrowSummary, WeddingEvent } from "@wedding-yantra/types";
import { withTransaction, type Db } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { getEvent } from "../bookings/events.js";

const requireGrow = (ctx: MemberContext) => {
  if (!can(ctx.role, "clients.manage")) throw forbidden("Only the owner or a manager can ask clients for reviews");
};

/**
 * Notes that the client was asked for a review. The message itself goes out on WhatsApp
 * from the person's phone; this keeps the business from asking twice by mistake.
 */
export async function requestReview(db: Db, ctx: MemberContext, eventId: string): Promise<WeddingEvent> {
  requireGrow(ctx);
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{
      status: string;
      client_name: string | null;
      end_date: string | null;
      today: string;
      review_url: string | null;
    }>(
      `SELECT e.status, c.name AS client_name, w.review_url,
              (SELECT max(date)::text FROM event_functions WHERE event_id = e.id) AS end_date,
              (now() AT TIME ZONE w.timezone)::date::text AS today
         FROM events e
         JOIN workspaces w ON w.id = e.workspace_id
         LEFT JOIN clients c ON c.id = e.client_id AND c.deleted_at IS NULL
        WHERE e.id = $1 AND e.workspace_id = $2 AND e.deleted_at IS NULL
        FOR UPDATE OF e`,
      [eventId, ctx.workspaceId],
    );
    const e = rows[0];
    if (!e) throw notFound("This event");
    if (!e.review_url) {
      throw new AppError(409, "NO_REVIEW_LINK", "Add your review link in Business profile first, so the message can carry it.");
    }
    if (!e.client_name) throw new AppError(409, "NO_CLIENT", "This event has no client to ask.");
    if (!eventIsOver({ status: e.status, endDate: e.end_date }, e.today)) {
      throw new AppError(409, "EVENT_NOT_OVER", "Ask once the event is over. If it already is, mark it done first.");
    }
    await tx.query(`UPDATE events SET review_requested_at = now(), review_requested_by = $2 WHERE id = $1`, [eventId, ctx.userId]);
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "event.review_requested",
      entityType: "event",
      entityId: eventId,
      meta: { client: e.client_name },
    });
    return getEvent(tx, ctx, eventId);
  });
}

/** Who to ask for a review, and who is sending work your way. */
export async function growSummary(db: Db, ctx: MemberContext): Promise<GrowSummary> {
  requireGrow(ctx);
  const ws = [ctx.workspaceId];
  const [business, toAsk, asked, referrals, top] = await Promise.all([
    db.query<{ review_url: string | null }>(`SELECT review_url FROM workspaces WHERE id = $1`, ws),
    // Over (done, or its last day has passed) within the last 60 days, and not asked yet.
    db.query<{ id: string; title: string; client_name: string | null; client_phone: string | null; end_date: string | null }>(
      `WITH today AS (SELECT (now() AT TIME ZONE timezone)::date AS d FROM workspaces WHERE id = $1)
       SELECT e.id, e.title, c.name AS client_name, c.phone AS client_phone, max(f.date)::text AS end_date
         FROM events e
         JOIN clients c ON c.id = e.client_id AND c.deleted_at IS NULL
         LEFT JOIN event_functions f ON f.event_id = e.id
        CROSS JOIN today
        WHERE e.workspace_id = $1 AND e.deleted_at IS NULL AND e.status <> 'cancelled' AND e.review_requested_at IS NULL
        GROUP BY e.id, c.name, c.phone, today.d
       HAVING (e.status = 'completed' OR max(f.date) < today.d)
          AND coalesce(max(f.date), e.updated_at::date) >= today.d - 60
        ORDER BY max(f.date) DESC NULLS LAST, e.created_at DESC
        LIMIT 50`,
      ws,
    ),
    db.query<{ n: string }>(
      `SELECT count(*) AS n FROM events
        WHERE workspace_id = $1 AND deleted_at IS NULL AND review_requested_at > now() - interval '30 days'`,
      ws,
    ),
    db.query<{ enquiries: string; booked: string }>(
      `SELECT count(*) AS enquiries, count(*) FILTER (WHERE s.kind = 'won') AS booked
         FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
        WHERE l.workspace_id = $1 AND l.deleted_at IS NULL AND l.created_at > now() - interval '12 months'
          AND (l.source = 'referral' OR l.referred_by_client_id IS NOT NULL)`,
      ws,
    ),
    db.query<{ id: string; name: string; enquiries: string; booked: string }>(
      `SELECT c.id, c.name, count(*) AS enquiries, count(*) FILTER (WHERE s.kind = 'won') AS booked
         FROM leads l
         JOIN clients c ON c.id = l.referred_by_client_id AND c.deleted_at IS NULL
         JOIN pipeline_stages s ON s.id = l.stage_id
        WHERE l.workspace_id = $1 AND l.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY count(*) FILTER (WHERE s.kind = 'won') DESC, count(*) DESC, c.name
        LIMIT 10`,
      ws,
    ),
  ]);
  return {
    reviewUrl: business.rows[0]?.review_url ?? null,
    toAsk: toAsk.rows.map((r) => ({
      eventId: r.id,
      title: r.title,
      clientName: r.client_name,
      clientPhone: r.client_phone,
      endDate: r.end_date,
    })),
    askedRecently: Number(asked.rows[0]?.n ?? 0),
    referrals: {
      enquiries: Number(referrals.rows[0]?.enquiries ?? 0),
      booked: Number(referrals.rows[0]?.booked ?? 0),
      top: top.rows.map((r) => ({ clientId: r.id, name: r.name, enquiries: Number(r.enquiries), booked: Number(r.booked) })),
    },
  };
}
