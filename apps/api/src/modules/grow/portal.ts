import { randomBytes, randomInt } from "node:crypto";
import { can, eventIsOver, quoteNumber, receiptNumber, round2, type PaymentMethod } from "@wedding-yantra/core";
import type { ClientPortal, ClientPortalLink, DeliverableStatus, EventType, PortalEvent } from "@wedding-yantra/types";
import { withTransaction, type Db } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

const requireShare = (ctx: MemberContext) => {
  if (!can(ctx.role, "clients.manage")) throw forbidden("Only the owner or a manager can share a client's page");
};

/** Letters and digits that can't be mistaken for each other when read out. */
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const newReferralCode = () => Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

/**
 * Turns on the client's page and returns its link. Asking again returns the same link,
 * so sending it twice never breaks the first one.
 */
export async function sharePortal(db: Db, ctx: MemberContext, clientId: string): Promise<ClientPortalLink> {
  requireShare(ctx);
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ portal_token: string | null }>(
      `SELECT portal_token FROM clients WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [clientId, ctx.workspaceId],
    );
    if (!rows[0]) throw notFound("This client");
    if (rows[0].portal_token) return { token: rows[0].portal_token };
    const token = randomBytes(24).toString("base64url");
    await tx.query(`UPDATE clients SET portal_token = $1, referral_code = coalesce(referral_code, $2) WHERE id = $3`, [
      token,
      newReferralCode(),
      clientId,
    ]);
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "client.portal_shared",
      entityType: "client",
      entityId: clientId,
    });
    return { token };
  });
}

/** The old link stops working at once. Sharing again makes a new one. */
export async function stopPortal(db: Db, ctx: MemberContext, clientId: string): Promise<void> {
  requireShare(ctx);
  await withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ portal_token: string | null }>(
      `SELECT portal_token FROM clients WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL FOR UPDATE`,
      [clientId, ctx.workspaceId],
    );
    if (!rows[0]) throw notFound("This client");
    if (!rows[0].portal_token) return;
    await tx.query(`UPDATE clients SET portal_token = NULL WHERE id = $1`, [clientId]);
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "client.portal_stopped",
      entityType: "client",
      entityId: clientId,
    });
  });
}

/**
 * What the client sees at /c/<token>: their events, the quotes they were sent, their bills
 * and what they've paid. Drafts, cancelled bills and cancelled events stay private.
 */
export async function getPortal(db: Db, token: string): Promise<ClientPortal> {
  const found = await db.query<{
    id: string;
    workspace_id: string;
    name: string;
    referral_code: string;
    business: string;
    type_name: string;
    icon: string;
    city: string;
    phone: string | null;
    email: string | null;
    review_url: string | null;
    form_slug: string | null;
    today: string;
  }>(
    `SELECT c.id, c.workspace_id, c.name, c.referral_code, w.name AS business, bt.name AS type_name, bt.icon,
            w.city, w.phone, w.email, w.review_url, f.slug AS form_slug,
            (now() AT TIME ZONE w.timezone)::date::text AS today
       FROM clients c
       JOIN workspaces w ON w.id = c.workspace_id AND w.deleted_at IS NULL
       JOIN business_types bt ON bt.id = w.business_type_id
       LEFT JOIN lead_forms f ON f.workspace_id = w.id AND f.enabled
      WHERE c.portal_token = $1 AND c.deleted_at IS NULL`,
    [token],
  );
  const c = found.rows[0];
  if (!c) throw notFound("This page");
  const ids = [c.workspace_id, c.id];

  const [events, quotes, bills, payments] = await Promise.all([
    db.query<{
      id: string;
      title: string;
      event_type: EventType | null;
      status: PortalEvent["status"];
      city: string | null;
      venue: string | null;
      start_date: string | null;
      end_date: string | null;
    }>(
      `SELECT e.id, e.title, e.event_type, e.status, e.city, e.venue,
              min(f.date)::text AS start_date, max(f.date)::text AS end_date
         FROM events e LEFT JOIN event_functions f ON f.event_id = e.id
        WHERE e.workspace_id = $1 AND e.client_id = $2 AND e.deleted_at IS NULL AND e.status <> 'cancelled'
        GROUP BY e.id
        ORDER BY min(f.date) ASC NULLS LAST, e.created_at`,
      ids,
    ),
    // Quotes made while they were still an enquiry belong to them too.
    db.query<{
      number: number;
      title: string | null;
      status: "sent" | "accepted";
      total: string;
      issue_date: string;
      valid_until: string | null;
      expired: boolean;
      share_token: string;
    }>(
      `SELECT q.number, q.title, q.status, q.total, q.issue_date::text AS issue_date, q.valid_until::text AS valid_until,
              (q.status = 'sent' AND q.valid_until IS NOT NULL AND q.valid_until < $3::date) AS expired, q.share_token
         FROM quotes q
        WHERE q.workspace_id = $1 AND q.deleted_at IS NULL AND q.status IN ('sent', 'accepted')
          AND (q.client_id = $2 OR q.lead_id IN (SELECT id FROM leads WHERE client_id = $2 AND deleted_at IS NULL))
        ORDER BY q.issue_date DESC, q.number DESC`,
      [...ids, c.today],
    ),
    db.query<{ number: string; issue_date: string; due_date: string | null; total: string; received: string; share_token: string }>(
      `SELECT b.number, b.issue_date::text AS issue_date, b.due_date::text AS due_date, b.total, b.share_token,
              coalesce((SELECT sum(p.amount) FROM payments p WHERE p.bill_id = b.id AND p.deleted_at IS NULL), 0) AS received
         FROM bills b
        WHERE b.workspace_id = $1 AND b.status = 'issued'
          AND (b.client_id = $2 OR b.event_id IN (SELECT id FROM events WHERE client_id = $2 AND deleted_at IS NULL))
        ORDER BY b.issue_date DESC, b.seq DESC`,
      ids,
    ),
    db.query<{ number: number; amount: string; paid_on: string; method: PaymentMethod }>(
      `SELECT p.number, p.amount, p.paid_on::text AS paid_on, p.method
         FROM payments p
        WHERE p.workspace_id = $1 AND p.deleted_at IS NULL
          AND (p.client_id = $2
               OR p.event_id IN (SELECT id FROM events WHERE client_id = $2 AND deleted_at IS NULL)
               OR p.bill_id IN (SELECT id FROM bills WHERE client_id = $2))
        ORDER BY p.paid_on DESC, p.number DESC`,
      ids,
    ),
  ]);

  const eventIds = events.rows.map((e) => e.id);
  const [functions, deliverables] = eventIds.length
    ? await Promise.all([
        db.query<{ event_id: string; name: string; date: string; start_time: string | null; venue: string | null }>(
          `SELECT event_id, name, date::text AS date, to_char(start_time, 'HH24:MI') AS start_time, venue
             FROM event_functions WHERE event_id = ANY($1::uuid[]) ORDER BY date, start_time NULLS LAST, position`,
          [eventIds],
        ),
        db.query<{ event_id: string; title: string; due_date: string | null; status: DeliverableStatus; link: string | null }>(
          `SELECT event_id, title, due_date::text AS due_date, status, link
             FROM deliverables WHERE event_id = ANY($1::uuid[]) AND deleted_at IS NULL
            ORDER BY due_date NULLS LAST, position`,
          [eventIds],
        ),
      ])
    : [{ rows: [] }, { rows: [] }];

  const portalBills = bills.rows.map((b) => {
    const total = Number(b.total);
    const received = Number(b.received);
    const due = Math.max(0, round2(total - received));
    return {
      number: b.number,
      issueDate: b.issue_date,
      dueDate: b.due_date,
      total,
      received,
      due,
      overdue: due > 0 && b.due_date !== null && b.due_date < c.today,
      token: b.share_token,
    };
  });
  const portalPayments = payments.rows.map((p) => ({
    number: receiptNumber(p.number),
    amount: Number(p.amount),
    paidOn: p.paid_on,
    method: p.method,
  }));

  return {
    business: {
      name: c.business,
      typeName: c.type_name,
      icon: c.icon,
      city: c.city,
      phone: c.phone,
      email: c.email,
      reviewUrl: c.review_url,
      formSlug: c.form_slug,
    },
    client: { name: c.name, referralCode: c.referral_code },
    events: events.rows.map((e) => ({
      title: e.title,
      eventType: e.event_type,
      status: e.status,
      city: e.city,
      venue: e.venue,
      startDate: e.start_date,
      endDate: e.end_date,
      functions: functions.rows
        .filter((f) => f.event_id === e.id)
        .map((f) => ({ name: f.name, date: f.date, startTime: f.start_time, venue: f.venue })),
      // The link is shared only once it's handed over.
      deliverables: deliverables.rows
        .filter((d) => d.event_id === e.id)
        .map((d) => ({ title: d.title, dueDate: d.due_date, status: d.status, link: d.status === "delivered" ? d.link : null })),
    })),
    quotes: quotes.rows.map((q) => ({
      number: quoteNumber(q.number),
      title: q.title,
      status: q.status,
      total: Number(q.total),
      issueDate: q.issue_date,
      validUntil: q.valid_until,
      expired: q.expired,
      token: q.share_token,
    })),
    bills: portalBills,
    payments: portalPayments,
    totals: {
      billed: round2(portalBills.reduce((s, b) => s + b.total, 0)),
      paid: round2(portalPayments.reduce((s, p) => s + p.amount, 0)),
      due: round2(portalBills.reduce((s, b) => s + b.due, 0)),
    },
    eventOver: events.rows.some((e) => eventIsOver({ status: e.status, endDate: e.end_date }, c.today)),
  };
}
