import { can, eventScope, formatDateRange, formatMoney, formatPhone, leadScope, quoteNumber, quoteScope } from "@wedding-yantra/core";
import {
  EVENT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  type EventStatus,
  type QuoteStatus,
  type SearchResult,
  type SearchResults,
} from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import type { MemberContext } from "../auth/guard.js";
import { quoteScopeSql } from "../bookings/quotes.js";
import { scopeCondition } from "../sales/leads.js";

/** At most this many of each kind, and this many in all. */
const PER_KIND = 5;
const TOTAL = 20;

/**
 * What the person typed, as LIKE patterns. Names match anywhere, but ones that start with
 * it (or have a word that does) come first. A phone matches on its last digits once four or
 * more are typed, whatever spaces, dashes or +91 the number was saved with.
 */
interface Terms {
  /** ILIKE pattern: contains */
  contains: string;
  /** ILIKE pattern: starts with */
  prefix: string;
  /** ILIKE pattern: a later word starts with */
  word: string;
  /** LIKE pattern on a phone's digits, or null when too few digits were typed */
  phoneContains: string | null;
  phoneEnds: string | null;
}

function termsFor(q: string): Terms {
  const escaped = q.replace(/[%_\\]/g, "\\$&");
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 4;
  return {
    contains: `%${escaped}%`,
    prefix: `${escaped}%`,
    word: `% ${escaped}%`,
    phoneContains: phone ? `%${digits}%` : null,
    phoneEnds: phone ? `%${digits}` : null,
  };
}

/** A phone column with only its digits, so "+91 98111 22233" ends with "2233". */
const digitsOf = (column: string) => `regexp_replace(coalesce(${column}, ''), '\\D', '', 'g')`;

/**
 * The "matches" condition and its rank (0: starts with it or the phone ends with it; 1: a
 * word starts with it; 2: somewhere inside), over the given name-like columns and phones.
 */
function matcher(t: Terms, params: unknown[], names: string[], phones: string[]): { where: string; rank: string } {
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const contains = add(t.contains);
  const prefix = add(t.prefix);
  const word = add(t.word);
  const where = names.map((n) => `${n} ILIKE ${contains}`);
  const first = names.map((n) => `${n} ILIKE ${prefix}`);
  const second = names.map((n) => `${n} ILIKE ${word}`);
  if (t.phoneContains && t.phoneEnds && phones.length) {
    const pc = add(t.phoneContains);
    const pe = add(t.phoneEnds);
    for (const p of phones) {
      where.push(`${digitsOf(p)} LIKE ${pc}`);
      first.push(`${digitsOf(p)} LIKE ${pe}`);
    }
  }
  return {
    where: `(${where.join(" OR ")})`,
    rank: `CASE WHEN ${first.join(" OR ")} THEN 0 WHEN ${second.join(" OR ")} THEN 1 ELSE 2 END`,
  };
}

const line = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ") || null;
const showPhone = (phone: string | null) => (phone ? formatPhone(phone) : null);

type Ranked = SearchResult & { rank: number };

/** Leads: every lead, or only the ones they added or were given, as on the leads list. */
async function leads(db: Queryable, ctx: MemberContext, t: Terms): Promise<Ranked[]> {
  if (leadScope(ctx) === "none") return [];
  const params: unknown[] = [ctx.workspaceId];
  const scope = scopeCondition(ctx, params);
  const m = matcher(t, params, ["l.name"], ["l.phone"]);
  const { rows } = await db.query<{ id: string; name: string; phone: string | null; city: string | null; stage_name: string; rank: number }>(
    `SELECT l.id, l.name, l.phone, l.city, s.name AS stage_name, ${m.rank} AS rank
       FROM leads l
       JOIN pipeline_stages s ON s.id = l.stage_id
      WHERE l.workspace_id = $1 AND l.deleted_at IS NULL AND ${scope} AND ${m.where}
      ORDER BY rank, l.updated_at DESC
      LIMIT ${PER_KIND}`,
    params,
  );
  return rows.map((r) => ({
    kind: "lead",
    id: r.id,
    title: r.name,
    subtitle: line(r.stage_name, showPhone(r.phone), r.city),
    href: `/app/leads/${r.id}`,
    rank: r.rank,
  }));
}

/** Clients: for people with the Clients screen. Archived ones stay out, as on the list. */
async function clients(db: Queryable, ctx: MemberContext, t: Terms): Promise<Ranked[]> {
  if (!can(ctx, "clients.view")) return [];
  const params: unknown[] = [ctx.workspaceId];
  const m = matcher(t, params, ["c.name", "c.bride_name", "c.groom_name"], ["c.phone"]);
  const { rows } = await db.query<{ id: string; name: string; phone: string | null; city: string | null; rank: number }>(
    `SELECT c.id, c.name, c.phone, c.city, ${m.rank} AS rank
       FROM clients c
      WHERE c.workspace_id = $1 AND c.deleted_at IS NULL AND c.archived_at IS NULL AND ${m.where}
      ORDER BY rank, c.created_at DESC
      LIMIT ${PER_KIND}`,
    params,
  );
  return rows.map((r) => ({
    kind: "client",
    id: r.id,
    title: r.name,
    subtitle: line(showPhone(r.phone), r.city),
    href: `/app/clients/${r.id}`,
    rank: r.rank,
  }));
}

/**
 * Events: every one, or only the ones they're on the team for. People who see only their
 * own don't see the client's number, so they can't find an event by it either.
 */
async function events(db: Queryable, ctx: MemberContext, t: Terms): Promise<Ranked[]> {
  const scope = eventScope(ctx);
  if (scope === "none") return [];
  const params: unknown[] = [ctx.workspaceId];
  let own = "TRUE";
  if (scope !== "all") {
    params.push(ctx.userId);
    own = `e.id IN (SELECT event_id FROM event_team WHERE user_id = $${params.length})`;
  }
  const m = matcher(t, params, ["e.title", "c.name"], scope === "all" ? ["c.phone"] : []);
  const { rows } = await db.query<{
    id: string;
    title: string;
    status: EventStatus;
    venue: string | null;
    start_date: string | null;
    end_date: string | null;
    rank: number;
  }>(
    `SELECT e.id, e.title, e.status,
            coalesce(e.venue, (SELECT f.venue FROM event_functions f WHERE f.event_id = e.id AND f.venue IS NOT NULL
                                ORDER BY f.date, f.position LIMIT 1), e.city) AS venue,
            (SELECT min(date)::text FROM event_functions WHERE event_id = e.id) AS start_date,
            (SELECT max(date)::text FROM event_functions WHERE event_id = e.id) AS end_date,
            ${m.rank} AS rank
       FROM events e
       LEFT JOIN clients c ON c.id = e.client_id
      WHERE e.workspace_id = $1 AND e.deleted_at IS NULL AND ${own} AND ${m.where}
      ORDER BY rank, e.created_at DESC
      LIMIT ${PER_KIND}`,
    params,
  );
  const thisYear = String(new Date().getFullYear());
  return rows.map((r) => ({
    kind: "event",
    id: r.id,
    title: r.title,
    subtitle: line(
      r.start_date && r.end_date ? formatDateRange(r.start_date, r.end_date, thisYear) : "No date yet",
      r.venue,
      r.status !== "confirmed" && EVENT_STATUS_LABELS[r.status],
    ),
    href: `/app/events/${r.id}`,
    rank: r.rank,
  }));
}

/** Quotes: by number, title or the client's name or number; staff find only their own, as on the list. */
async function quotes(db: Queryable, ctx: MemberContext, t: Terms): Promise<Ranked[]> {
  if (quoteScope(ctx) === "none") return [];
  const params: unknown[] = [ctx.workspaceId];
  const scope = quoteScopeSql(ctx, params);
  // Q-0007, as quoteNumber writes it.
  const number = `('Q-' || CASE WHEN q.number < 10000 THEN lpad(q.number::text, 4, '0') ELSE q.number::text END)`;
  const m = matcher(t, params, [number, "q.title", "coalesce(c.name, l.name)"], ["coalesce(c.phone, l.phone)"]);
  const { rows } = await db.query<{
    id: string;
    number: number;
    title: string;
    status: QuoteStatus;
    customer_name: string;
    total: string;
    rank: number;
  }>(
    `SELECT q.id, q.number, q.title, q.status, coalesce(c.name, l.name, 'Client') AS customer_name, q.total, ${m.rank} AS rank
       FROM quotes q
       LEFT JOIN clients c ON c.id = q.client_id
       LEFT JOIN leads l ON l.id = q.lead_id
      WHERE q.workspace_id = $1 AND q.deleted_at IS NULL AND ${scope} AND ${m.where}
      ORDER BY rank, q.number DESC
      LIMIT ${PER_KIND}`,
    params,
  );
  return rows.map((r) => ({
    kind: "quote",
    id: r.id,
    title: `${quoteNumber(r.number)} · ${r.customer_name}`,
    subtitle: line(r.title, formatMoney(Number(r.total)), QUOTE_STATUS_LABELS[r.status]),
    href: `/app/quotes/${r.id}`,
    rank: r.rank,
  }));
}

/** Invoices: only for people with the money screens. */
async function bills(db: Queryable, ctx: MemberContext, t: Terms): Promise<Ranked[]> {
  if (!can(ctx, "finance.view")) return [];
  const params: unknown[] = [ctx.workspaceId];
  const m = matcher(t, params, ["b.number", "coalesce(c.name, b.bill_to_name)", "b.subject"], ["coalesce(c.phone, b.bill_to_phone)"]);
  const { rows } = await db.query<{
    id: string;
    number: string;
    status: "issued" | "cancelled";
    client_name: string | null;
    total: string;
    received: string;
    rank: number;
  }>(
    `SELECT b.id, b.number, b.status, coalesce(c.name, b.bill_to_name) AS client_name, b.total,
            coalesce((SELECT sum(p.amount) FROM payments p WHERE p.bill_id = b.id AND p.deleted_at IS NULL), 0) AS received,
            ${m.rank} AS rank
       FROM bills b
       LEFT JOIN clients c ON c.id = b.client_id
      WHERE b.workspace_id = $1 AND ${m.where}
      ORDER BY rank, b.issue_date DESC, b.fy DESC, b.seq DESC
      LIMIT ${PER_KIND}`,
    params,
  );
  return rows.map((r) => {
    const total = Number(r.total);
    const due = Math.max(Math.round((total - Number(r.received)) * 100) / 100, 0);
    const state = r.status === "cancelled" ? "Cancelled" : due === 0 ? "Paid" : `${formatMoney(due)} due`;
    return {
      kind: "bill",
      id: r.id,
      title: line(r.number, r.client_name)!,
      subtitle: line(formatMoney(total), state),
      href: `/app/bills/${r.id}`,
      rank: r.rank,
    };
  });
}

/**
 * Finds enquiries, clients, events, quotes and invoices by name or phone. Each kind follows
 * the same rules as its own list, so nobody finds what they couldn't open.
 */
export async function searchAll(db: Queryable, ctx: MemberContext, q: string): Promise<SearchResults> {
  const t = termsFor(q);
  const found = await Promise.all([leads, clients, events, quotes, bills].map((find) => find(db, ctx, t)));
  // Best matches first; within a rank, kinds keep their order (sort is stable).
  const results = found
    .flat()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, TOTAL)
    .map(({ rank: _rank, ...r }) => r);
  return { q, results };
}
