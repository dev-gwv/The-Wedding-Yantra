import { randomBytes } from "node:crypto";
import { can, computeQuoteTotals, quoteNumber } from "@wedding-yantra/core";
import {
  EVENT_LABELS,
  type EventType,
  type PublicQuote,
  type Quote,
  type QuoteItem,
  type QuoteStatus,
  type QuoteSummary,
  type ServiceUnit,
} from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { upsertClientForLead } from "../sales/leads.js";

const requireView = (ctx: MemberContext) => {
  if (!can(ctx.role, "quotes.view")) throw forbidden("Your role doesn't include quotes");
};
const requireManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "quotes.manage")) throw forbidden("Only the owner or a manager can make quotes");
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface QuoteRow {
  id: string;
  workspace_id: string;
  number: number;
  title: string;
  status: QuoteStatus;
  customer_name: string;
  customer_phone: string | null;
  lead_id: string | null;
  client_id: string | null;
  event_id: string | null;
  issue_date: string;
  valid_until: string | null;
  expired: boolean;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  notes: string | null;
  terms: string | null;
  share_token: string;
  accepted_at: Date | null;
  accepted_by: string | null;
  declined_at: Date | null;
  decline_reason: string | null;
  created_at: Date;
}

const QUOTE_SELECT = `
  SELECT q.id, q.workspace_id, q.number, q.title, q.status,
         coalesce(c.name, l.name, 'Client') AS customer_name, coalesce(c.phone, l.phone) AS customer_phone,
         q.lead_id, q.client_id, q.event_id, q.issue_date::text AS issue_date, q.valid_until::text AS valid_until,
         (q.status = 'sent' AND q.valid_until IS NOT NULL
            AND q.valid_until < (now() AT TIME ZONE w.timezone)::date) AS expired,
         q.subtotal, q.discount, q.tax, q.total, q.notes, q.terms, q.share_token,
         q.accepted_at, q.accepted_by, q.declined_at, q.decline_reason, q.created_at
    FROM quotes q
    JOIN workspaces w ON w.id = q.workspace_id
    LEFT JOIN clients c ON c.id = q.client_id
    LEFT JOIN leads l ON l.id = q.lead_id`;

const toSummary = (r: QuoteRow): QuoteSummary => ({
  id: r.id,
  number: quoteNumber(r.number),
  title: r.title,
  status: r.status,
  customerName: r.customer_name,
  leadId: r.lead_id,
  clientId: r.client_id,
  issueDate: r.issue_date,
  validUntil: r.valid_until,
  expired: r.expired,
  subtotal: Number(r.subtotal),
  discount: Number(r.discount),
  tax: Number(r.tax),
  total: Number(r.total),
  createdAt: r.created_at.toISOString(),
});

async function loadItems(db: Queryable, quoteId: string): Promise<QuoteItem[]> {
  const { rows } = await db.query<{
    id: string;
    catalogue_item_id: string | null;
    name: string;
    description: string | null;
    unit: ServiceUnit;
    quantity: string;
    rate: string;
    tax_rate: string;
    amount: string;
  }>(
    `SELECT id, catalogue_item_id, name, description, unit, quantity, rate, tax_rate, amount
       FROM quote_items WHERE quote_id = $1 ORDER BY position`,
    [quoteId],
  );
  return rows.map((r) => ({
    id: r.id,
    catalogueItemId: r.catalogue_item_id,
    name: r.name,
    description: r.description,
    unit: r.unit,
    quantity: Number(r.quantity),
    rate: Number(r.rate),
    taxRate: Number(r.tax_rate),
    amount: Number(r.amount),
  }));
}

async function toQuote(db: Queryable, r: QuoteRow): Promise<Quote> {
  return {
    ...toSummary(r),
    customerPhone: r.customer_phone,
    items: await loadItems(db, r.id),
    notes: r.notes,
    terms: r.terms,
    shareToken: r.share_token,
    acceptedAt: r.accepted_at?.toISOString() ?? null,
    acceptedBy: r.accepted_by,
    declinedAt: r.declined_at?.toISOString() ?? null,
    declineReason: r.decline_reason,
    eventId: r.event_id,
  };
}

async function loadRow(db: Queryable, workspaceId: string, quoteId: string, lock = false): Promise<QuoteRow> {
  const { rows } = await db.query<QuoteRow>(
    `${QUOTE_SELECT} WHERE q.id = $1 AND q.workspace_id = $2 AND q.deleted_at IS NULL${lock ? " FOR UPDATE OF q" : ""}`,
    [quoteId, workspaceId],
  );
  if (!rows[0]) throw notFound("This quote");
  return rows[0];
}

export async function getQuote(db: Queryable, ctx: MemberContext, quoteId: string): Promise<Quote> {
  requireView(ctx);
  return toQuote(db, await loadRow(db, ctx.workspaceId, quoteId));
}

export async function listQuotes(
  db: Db,
  ctx: MemberContext,
  filters: { leadId?: string; clientId?: string; status?: QuoteStatus } = {},
): Promise<QuoteSummary[]> {
  requireView(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const where = ["q.workspace_id = $1", "q.deleted_at IS NULL"];
  if (filters.leadId) {
    params.push(filters.leadId);
    where.push(`q.lead_id = $${params.length}`);
  }
  if (filters.clientId) {
    params.push(filters.clientId);
    where.push(`q.client_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`q.status = $${params.length}`);
  }
  const { rows } = await db.query<QuoteRow>(
    `${QUOTE_SELECT} WHERE ${where.join(" AND ")} ORDER BY q.number DESC LIMIT 300`,
    params,
  );
  return rows.map(toSummary);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export interface ItemFields {
  catalogueItemId?: string | null;
  name: string;
  description?: string | null;
  unit: ServiceUnit;
  quantity: number;
  rate: number;
  taxRate: number;
}

/** Next running number for this business. Safe when two people save at once. */
export async function nextNumber(db: Queryable, workspaceId: string, kind: string): Promise<number> {
  const { rows } = await db.query<{ value: number }>(
    `INSERT INTO workspace_counters (workspace_id, kind, value) VALUES ($1, $2, 1)
     ON CONFLICT (workspace_id, kind) DO UPDATE SET value = workspace_counters.value + 1
     RETURNING value`,
    [workspaceId, kind],
  );
  return rows[0]!.value;
}

async function writeItems(db: Queryable, workspaceId: string, quoteId: string, items: ItemFields[], discount: number) {
  const totals = computeQuoteTotals(items, discount);
  await db.query(`DELETE FROM quote_items WHERE quote_id = $1`, [quoteId]);
  for (const [i, item] of items.entries()) {
    await db.query(
      `INSERT INTO quote_items (workspace_id, quote_id, catalogue_item_id, name, description, unit, quantity, rate, tax_rate, amount, position)
       VALUES ($1, $2,
               (SELECT id FROM catalogue_items WHERE id = $3 AND workspace_id = $1),
               $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        workspaceId,
        quoteId,
        item.catalogueItemId ?? null,
        item.name,
        item.description ?? null,
        item.unit,
        item.quantity,
        item.rate,
        item.taxRate,
        totals.lineAmounts[i],
        i,
      ],
    );
  }
  await db.query(`UPDATE quotes SET subtotal = $2, discount = $3, tax = $4, total = $5 WHERE id = $1`, [
    quoteId,
    totals.subtotal,
    totals.discount,
    totals.tax,
    totals.total,
  ]);
}

export async function createQuote(
  db: Db,
  ctx: MemberContext,
  input: {
    leadId?: string | null;
    clientId?: string | null;
    title: string;
    items: ItemFields[];
    discount: number;
    validUntil?: string | null;
    notes?: string | null;
    terms?: string | null;
  },
): Promise<Quote> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    let clientId = input.clientId ?? null;
    if (input.leadId) {
      const lead = await tx.query<{ client_id: string | null }>(
        `SELECT client_id FROM leads WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
        [input.leadId, ctx.workspaceId],
      );
      if (!lead.rows[0]) throw new AppError(400, "VALIDATION_ERROR", "Choose a lead from your list", { leadId: "Choose a lead" });
      clientId = clientId ?? lead.rows[0].client_id;
    }
    if (clientId) {
      const client = await tx.query(`SELECT 1 FROM clients WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [
        clientId,
        ctx.workspaceId,
      ]);
      if (!client.rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose a client from your list", { clientId: "Choose a client" });
    }

    const number = await nextNumber(tx, ctx.workspaceId, "quote");
    const terms =
      input.terms !== undefined
        ? input.terms
        : ((await tx.query<{ quote_terms: string | null }>(`SELECT quote_terms FROM workspaces WHERE id = $1`, [ctx.workspaceId]))
            .rows[0]?.quote_terms ?? null);
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO quotes (workspace_id, number, lead_id, client_id, title, valid_until, notes, terms, share_token, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        ctx.workspaceId,
        number,
        input.leadId ?? null,
        clientId,
        input.title,
        input.validUntil ?? null,
        input.notes ?? null,
        terms,
        randomBytes(18).toString("base64url"),
        ctx.userId,
      ],
    );
    const id = rows[0]!.id;
    await writeItems(tx, ctx.workspaceId, id, input.items, input.discount);
    if (input.leadId) {
      await tx.query(
        `INSERT INTO lead_activities (workspace_id, lead_id, actor_user_id, kind, body, meta)
         VALUES ($1, $2, $3, 'note', $4, $5)`,
        [ctx.workspaceId, input.leadId, ctx.userId, `Made quote ${quoteNumber(number)}`, { quoteId: id }],
      );
    }
    return toQuote(tx, await loadRow(tx, ctx.workspaceId, id));
  });
}

export async function updateQuote(
  db: Db,
  ctx: MemberContext,
  quoteId: string,
  input: {
    title?: string;
    items?: ItemFields[];
    discount?: number;
    validUntil?: string | null;
    notes?: string | null;
    terms?: string | null;
  },
): Promise<Quote> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const current = await loadRow(tx, ctx.workspaceId, quoteId, true);
    if (current.status === "accepted" || current.status === "declined") {
      throw new AppError(409, "QUOTE_CLOSED", `This quote was ${current.status}. Make a new one to change it.`);
    }
    const map: [keyof typeof input, string][] = [
      ["title", "title"],
      ["validUntil", "valid_until"],
      ["notes", "notes"],
      ["terms", "terms"],
    ];
    const sets: string[] = [];
    const values: unknown[] = [quoteId];
    for (const [key, column] of map) {
      if (input[key] === undefined) continue;
      values.push(input[key]);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length) await tx.query(`UPDATE quotes SET ${sets.join(", ")} WHERE id = $1`, values);
    if (input.items || input.discount !== undefined) {
      const items: ItemFields[] = input.items ?? (await loadItems(tx, quoteId));
      await writeItems(tx, ctx.workspaceId, quoteId, items, input.discount ?? Number(current.discount));
    }
    return toQuote(tx, await loadRow(tx, ctx.workspaceId, quoteId));
  });
}

export async function markSent(db: Db, ctx: MemberContext, quoteId: string): Promise<Quote> {
  requireManage(ctx);
  const current = await loadRow(db, ctx.workspaceId, quoteId);
  if (current.status === "draft") {
    await db.query(`UPDATE quotes SET status = 'sent', sent_at = now() WHERE id = $1`, [quoteId]);
    if (current.lead_id) {
      await db.query(
        `INSERT INTO lead_activities (workspace_id, lead_id, actor_user_id, kind, body, meta)
         VALUES ($1, $2, $3, 'note', $4, $5)`,
        [ctx.workspaceId, current.lead_id, ctx.userId, `Sent quote ${quoteNumber(current.number)}`, { quoteId }],
      );
    }
  }
  return getQuote(db, ctx, quoteId);
}

export async function deleteQuote(db: Db, ctx: MemberContext, quoteId: string): Promise<void> {
  requireManage(ctx);
  const current = await loadRow(db, ctx.workspaceId, quoteId);
  if (current.status === "accepted") throw new AppError(409, "QUOTE_CLOSED", "Accepted quotes are kept for your records");
  await db.query(`UPDATE quotes SET deleted_at = now() WHERE id = $1`, [quoteId]);
}

// ---------------------------------------------------------------------------
// Booking: what happens when a client says yes
// ---------------------------------------------------------------------------

interface LeadForBooking {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  venue: string | null;
  event_type: EventType | null;
  event_date: string | null;
  stage_id: string;
  stage_name: string;
  client_id: string | null;
}

/**
 * Accepting a quote books the job:
 * the lead moves to the Booked stage, the client is created or linked, and an event is
 * created (or updated) with the quote's value and the lead's event date as its first
 * function. Running it twice changes nothing.
 */
async function book(tx: Queryable, quote: QuoteRow, acceptedBy: string, actorUserId: string | null): Promise<void> {
  if (quote.status === "accepted") return;
  if (quote.status === "declined") throw new AppError(409, "QUOTE_CLOSED", "This quote was declined");

  const ws = quote.workspace_id;
  let clientId = quote.client_id;
  let lead: LeadForBooking | null = null;

  if (quote.lead_id) {
    const found = await tx.query<LeadForBooking>(
      `SELECT l.id, l.name, l.phone, l.email, l.city, l.venue, l.event_type, l.event_date::text AS event_date,
              l.stage_id, s.name AS stage_name, l.client_id
         FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
        WHERE l.id = $1 AND l.workspace_id = $2 FOR UPDATE OF l`,
      [quote.lead_id, ws],
    );
    lead = found.rows[0] ?? null;
  }

  if (lead) {
    clientId = clientId ?? lead.client_id ?? (await upsertClientForLead(tx, { workspaceId: ws, userId: actorUserId }, lead));
    const won = await tx.query<{ id: string; name: string }>(
      `SELECT id, name FROM pipeline_stages WHERE workspace_id = $1 AND kind = 'won' ORDER BY position LIMIT 1`,
      [ws],
    );
    const wonStage = won.rows[0];
    if (wonStage && lead.stage_id !== wonStage.id) {
      await tx.query(
        `UPDATE leads SET stage_id = $2, client_id = $3, next_follow_up_at = NULL, lost_reason = NULL, stage_changed_at = now()
          WHERE id = $1`,
        [lead.id, wonStage.id, clientId],
      );
      await tx.query(
        `INSERT INTO lead_activities (workspace_id, lead_id, actor_user_id, kind, meta)
         VALUES ($1, $2, $3, 'stage_changed', $4)`,
        [ws, lead.id, actorUserId, { from: lead.stage_name, to: wonStage.name, kind: "won", via: "quote", quote: quoteNumber(quote.number), by: acceptedBy }],
      );
    } else if (!lead.client_id) {
      await tx.query(`UPDATE leads SET client_id = $2 WHERE id = $1`, [lead.id, clientId]);
    }
  }

  // One event per lead: reuse it if it exists, otherwise create it.
  let eventId: string | null = null;
  if (lead) {
    const existing = await tx.query<{ id: string }>(`SELECT id FROM events WHERE lead_id = $1 AND deleted_at IS NULL`, [lead.id]);
    eventId = existing.rows[0]?.id ?? null;
  }
  if (eventId) {
    await tx.query(`UPDATE events SET value = $2, client_id = coalesce(client_id, $3) WHERE id = $1`, [eventId, quote.total, clientId]);
  } else {
    const typeLabel = lead?.event_type ? EVENT_LABELS[lead.event_type] : null;
    const title = typeLabel ? `${quote.customer_name} · ${typeLabel}` : quote.title;
    const created = await tx.query<{ id: string }>(
      `INSERT INTO events (workspace_id, client_id, lead_id, title, event_type, value, city, venue, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [ws, clientId, lead?.id ?? null, title, lead?.event_type ?? null, quote.total, lead?.city ?? null, lead?.venue ?? null, actorUserId],
    );
    eventId = created.rows[0]!.id;
    if (lead?.event_date) {
      await tx.query(
        `INSERT INTO event_functions (workspace_id, event_id, name, date, venue, position) VALUES ($1, $2, $3, $4, $5, 0)`,
        [ws, eventId, typeLabel ?? "Event", lead.event_date, lead.venue],
      );
    }
  }

  await tx.query(
    `UPDATE quotes SET status = 'accepted', accepted_at = now(), accepted_by = $2, client_id = coalesce(client_id, $3), event_id = $4
      WHERE id = $1`,
    [quote.id, acceptedBy, clientId, eventId],
  );
  await logActivity(tx, {
    workspaceId: ws,
    actorUserId,
    action: "quote.accepted",
    entityType: "quote",
    entityId: quote.id,
    meta: { number: quoteNumber(quote.number), by: acceptedBy, eventId },
  });
}

async function decline(tx: Queryable, quote: QuoteRow, reason: string | null, actorUserId: string | null) {
  if (quote.status === "declined") return;
  if (quote.status === "accepted") throw new AppError(409, "QUOTE_CLOSED", "This quote was already accepted");
  await tx.query(`UPDATE quotes SET status = 'declined', declined_at = now(), decline_reason = $2 WHERE id = $1`, [
    quote.id,
    reason,
  ]);
  if (quote.lead_id) {
    await tx.query(
      `INSERT INTO lead_activities (workspace_id, lead_id, actor_user_id, kind, body, meta)
       VALUES ($1, $2, $3, 'note', $4, $5)`,
      [
        quote.workspace_id,
        quote.lead_id,
        actorUserId,
        `Quote ${quoteNumber(quote.number)} was declined${reason ? `: ${reason}` : ""}`,
        { quoteId: quote.id },
      ],
    );
  }
}

/** The owner marks a quote accepted (for example, the client said yes on the phone). */
export async function acceptQuote(db: Db, ctx: MemberContext, quoteId: string): Promise<Quote> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const row = await loadRow(tx, ctx.workspaceId, quoteId, true);
    const who = (await tx.query<{ name: string | null }>(`SELECT name FROM users WHERE id = $1`, [ctx.userId])).rows[0]?.name;
    await book(tx, row, `Marked by ${who ?? "the team"}`, ctx.userId);
    return toQuote(tx, await loadRow(tx, ctx.workspaceId, quoteId));
  });
}

export async function declineQuote(db: Db, ctx: MemberContext, quoteId: string, reason: string | null): Promise<Quote> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const row = await loadRow(tx, ctx.workspaceId, quoteId, true);
    await decline(tx, row, reason, ctx.userId);
    return toQuote(tx, await loadRow(tx, ctx.workspaceId, quoteId));
  });
}

// ---------------------------------------------------------------------------
// Public: the client's view at /q/<token>
// ---------------------------------------------------------------------------

async function loadByToken(db: Queryable, token: string, lock = false): Promise<QuoteRow> {
  const { rows } = await db.query<QuoteRow>(
    `${QUOTE_SELECT} WHERE q.share_token = $1 AND q.deleted_at IS NULL AND w.deleted_at IS NULL${lock ? " FOR UPDATE OF q" : ""}`,
    [token],
  );
  if (!rows[0]) throw notFound("This quote");
  return rows[0];
}

export async function getPublicQuote(db: Db, token: string): Promise<PublicQuote> {
  const row = await loadByToken(db, token);
  const { rows } = await db.query<{
    name: string;
    type_name: string;
    icon: string;
    city: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    gstin: string | null;
  }>(
    `SELECT w.name, bt.name AS type_name, bt.icon, w.city, w.phone, w.email, w.address, w.gstin
       FROM workspaces w JOIN business_types bt ON bt.id = w.business_type_id WHERE w.id = $1`,
    [row.workspace_id],
  );
  const quote = await toQuote(db, row);
  const { shareToken: _t, leadId: _l, clientId: _c, eventId: _e, customerPhone: _p, ...visible } = quote;
  void _t;
  void _l;
  void _c;
  void _e;
  void _p;
  const b = rows[0]!;
  return {
    business: {
      name: b.name,
      typeName: b.type_name,
      icon: b.icon,
      city: b.city,
      phone: b.phone,
      email: b.email,
      address: b.address,
      gstin: b.gstin,
    },
    quote: visible,
  };
}

export async function acceptPublicQuote(db: Db, token: string, name: string): Promise<PublicQuote> {
  await withTransaction(db, async (tx) => {
    const row = await loadByToken(tx, token, true);
    if (row.expired) throw new AppError(410, "QUOTE_EXPIRED", "This quote has expired. Please ask for a new one.");
    await book(tx, row, name, null);
  });
  return getPublicQuote(db, token);
}

export async function declinePublicQuote(db: Db, token: string, reason: string | null): Promise<PublicQuote> {
  await withTransaction(db, async (tx) => {
    const row = await loadByToken(tx, token, true);
    await decline(tx, row, reason, null);
  });
  return getPublicQuote(db, token);
}
