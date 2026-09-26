import { can, formatDate, formatDateRange, ROLE_INFO, type Role } from "@wedding-yantra/core";
import type { ActivityItem, ActivityPage } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { AppError, forbidden } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

export const requireReview = (ctx: MemberContext) => {
  if (!can(ctx.role, "team.review")) throw forbidden("Only the owner or a manager can see this");
};

const PAGE = 40;

interface Row {
  source: "lead" | "log";
  id: string;
  at_key: string;
  created_at: Date;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  body: string | null;
}

/** The cursor is the last item's exact time (to the microsecond), source and id. */
const encode = (r: Row) => Buffer.from(JSON.stringify([r.at_key, r.source, r.id])).toString("base64url");
function decode(cursor: string): [string, string, string] {
  try {
    const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "string") && !Number.isNaN(Date.parse(v[0] as string))) {
      return v as [string, string, string];
    }
  } catch {
    // fall through
  }
  throw new AppError(400, "VALIDATION_ERROR", "That page link is broken", { before: "Start from the top" });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const roleLabel = (v: unknown) => (typeof v === "string" && v in ROLE_INFO ? ROLE_INFO[v as Role].label : null);

/** Looks up names for one kind of thing, by id, within the business. Deleted things keep their names. */
async function lookup<T extends { id: string }>(db: Queryable, sql: string, workspaceId: string, ids: Set<string>): Promise<Map<string, T>> {
  const list = [...ids].filter((id) => UUID.test(id));
  if (list.length === 0) return new Map();
  const { rows } = await db.query<T>(sql, [workspaceId, list]);
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Who did what, newest first: the business log merged with every lead's timeline.
 * For owners and managers. `userId` narrows it to one person.
 */
export async function activityFeed(db: Queryable, ctx: MemberContext, q: { before?: string; userId?: string }): Promise<ActivityPage> {
  requireReview(ctx);
  const params: unknown[] = [ctx.workspaceId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const byActor = q.userId ? add(q.userId) : null;
  let after = "";
  if (q.before) {
    const [at, source, id] = decode(q.before);
    after = `WHERE (x.created_at, x.source, x.id) < (${add(at)}::timestamptz, ${add(source)}, ${add(id)})`;
  }
  const { rows } = await db.query<Row>(
    `SELECT x.*, to_char(x.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at_key, u.name AS actor_name
       FROM (
         SELECT 'log' AS source, a.id::text AS id, a.created_at, a.actor_user_id, a.action, a.entity_type, a.entity_id, a.meta, NULL AS body
           FROM activity_log a
          WHERE a.workspace_id = $1 ${byActor ? `AND a.actor_user_id = ${byActor}` : ""}
         UNION ALL
         SELECT 'lead', la.id::text, la.created_at, la.actor_user_id, 'lead.' || la.kind, 'lead', la.lead_id::text, la.meta, la.body
           FROM lead_activities la
          WHERE la.workspace_id = $1 ${byActor ? `AND la.actor_user_id = ${byActor}` : ""}
       ) x
       LEFT JOIN users u ON u.id = x.actor_user_id
       ${after}
      ORDER BY x.created_at DESC, x.source DESC, x.id DESC
      LIMIT ${PAGE + 1}`,
    params,
  );
  const page = rows.slice(0, PAGE);

  // Everything the page mentions, looked up in one go per kind.
  const ids = (type: string) => new Set(page.filter((r) => r.entity_type === type && r.entity_id).map((r) => r.entity_id!));
  const metaIds = (key: string) => new Set(page.map((r) => str(r.meta[key])).filter((v): v is string => v !== null));
  const ws = ctx.workspaceId;
  const [events, tasks, bills, payments, expenses, quotes, members, invitations, leads, clients, users, workspace] = await Promise.all([
    lookup<{ id: string; title: string }>(db, `SELECT id, title FROM events WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, ws, new Set([...ids("event"), ...metaIds("eventId")])),
    lookup<{ id: string; title: string; event_id: string | null; event_title: string | null }>(
      db,
      `SELECT t.id, t.title, t.event_id, e.title AS event_title FROM tasks t LEFT JOIN events e ON e.id = t.event_id
        WHERE t.workspace_id = $1 AND t.id = ANY($2::uuid[])`,
      ws,
      ids("task"),
    ),
    lookup<{ id: string; number: string; bill_to_name: string }>(
      db,
      `SELECT id, number, bill_to_name FROM bills WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
      ws,
      ids("bill"),
    ),
    lookup<{ id: string; amount: string; payer: string | null; bill_id: string | null; event_id: string | null }>(
      db,
      `SELECT p.id, p.amount, coalesce(b.bill_to_name, c.name, e.title) AS payer, p.bill_id, p.event_id
         FROM payments p LEFT JOIN bills b ON b.id = p.bill_id LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN events e ON e.id = p.event_id
        WHERE p.workspace_id = $1 AND p.id = ANY($2::uuid[])`,
      ws,
      ids("payment"),
    ),
    lookup<{ id: string; amount: string; event_title: string | null; submitter: string | null }>(
      db,
      `SELECT x.id, x.amount, e.title AS event_title, u.name AS submitter
         FROM expenses x LEFT JOIN events e ON e.id = x.event_id LEFT JOIN users u ON u.id = x.submitted_by
        WHERE x.workspace_id = $1 AND x.id = ANY($2::uuid[])`,
      ws,
      ids("expense"),
    ),
    lookup<{ id: string; total: string; client: string | null }>(
      db,
      `SELECT q.id, q.total, coalesce(c.name, l.name) AS client
         FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN leads l ON l.id = q.lead_id
        WHERE q.workspace_id = $1 AND q.id = ANY($2::uuid[])`,
      ws,
      ids("quote"),
    ),
    lookup<{ id: string; name: string | null }>(
      db,
      `SELECT m.id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND m.id = ANY($2::uuid[])`,
      ws,
      ids("membership"),
    ),
    lookup<{ id: string; name: string }>(db, `SELECT id, name FROM invitations WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, ws, ids("invitation")),
    lookup<{ id: string; name: string }>(db, `SELECT id, name FROM leads WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, ws, ids("lead")),
    lookup<{ id: string; name: string }>(db, `SELECT id, name FROM clients WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, ws, ids("client")),
    // People a task went to or marked off; limited to members of this business, past or present.
    lookup<{ id: string; name: string | null }>(
      db,
      `SELECT u.id, u.name FROM users u WHERE u.id = ANY($2::uuid[])
          AND EXISTS (SELECT 1 FROM memberships m WHERE m.workspace_id = $1 AND m.user_id = u.id)`,
      ws,
      new Set([...metaIds("assigneeId"), ...metaIds("userId")]),
    ),
    db.query<{ name: string }>(`SELECT name FROM workspaces WHERE id = $1`, [ws]),
  ]);

  const items = page.map((r): ActivityItem => {
    const m = r.meta;
    const item: ActivityItem = {
      id: `${r.source}:${r.id}`,
      at: r.created_at.toISOString(),
      actor: r.actor_user_id ? { id: r.actor_user_id, name: r.actor_name } : null,
      action: r.action,
      subject: null,
      other: null,
      amount: null,
      detail: null,
      late: false,
      link: null,
    };
    const id = r.entity_id;
    switch (r.entity_type) {
      case "workspace":
        if (r.action === "workspace.created") item.subject = workspace.rows[0]?.name ?? null;
        break;
      case "invitation":
        item.subject = (id && invitations.get(id)?.name) ?? null;
        item.detail = roleLabel(m.role);
        item.link = { kind: "team", id: null };
        break;
      case "membership":
        item.subject = (id && members.get(id)?.name) ?? null;
        item.detail = roleLabel(m.to);
        item.link = { kind: "team", id: null };
        break;
      case "quote": {
        const quote = id ? quotes.get(id) : undefined;
        item.subject = str(m.number);
        item.other = str(m.by) ?? quote?.client ?? null;
        item.amount = quote ? Number(quote.total) : null;
        item.link = id ? { kind: "quote", id } : null;
        break;
      }
      case "event":
        item.subject = (id && events.get(id)?.title) ?? null;
        if (r.action === "event.review_requested") item.other = str(m.client);
        item.link = id ? { kind: "event", id } : null;
        break;
      case "payout":
        item.other = str(m.vendor);
        item.amount = num(m.amount);
        item.subject = (str(m.eventId) && events.get(str(m.eventId)!)?.title) ?? null;
        item.link = str(m.eventId) ? { kind: "event", id: str(m.eventId) } : null;
        break;
      case "deliverable":
        item.subject = str(m.title);
        item.detail = (str(m.eventId) && events.get(str(m.eventId)!)?.title) ?? null;
        item.late = m.late === true;
        item.link = str(m.eventId) ? { kind: "event", id: str(m.eventId) } : null;
        break;
      case "client":
        item.subject = (id && clients.get(id)?.name) ?? null;
        item.link = id ? { kind: "client", id } : null;
        break;
      case "bill": {
        const bill = id ? bills.get(id) : undefined;
        item.subject = bill?.number ?? str(m.number);
        item.other = bill?.bill_to_name ?? null;
        item.amount = r.action === "bill.cancelled" ? null : num(m.total);
        item.detail = r.action === "bill.cancelled" ? str(m.reason) : null;
        item.link = id ? { kind: "bill", id } : null;
        break;
      }
      case "payment": {
        const p = id ? payments.get(id) : undefined;
        item.other = p?.payer ?? null;
        item.amount = num(m.amount) ?? (p ? Number(p.amount) : null);
        const billId = str(m.billId) ?? p?.bill_id ?? null;
        const eventId = str(m.eventId) ?? p?.event_id ?? null;
        item.link = r.action === "payment.deleted" ? null : billId ? { kind: "bill", id: billId } : eventId ? { kind: "event", id: eventId } : null;
        break;
      }
      case "expense": {
        const x = id ? expenses.get(id) : undefined;
        item.amount = num(m.amount) ?? (x ? Number(x.amount) : null);
        item.subject = x?.event_title ?? null;
        item.other = str(m.to) ?? x?.submitter ?? null;
        item.detail = str(m.reason);
        item.link = r.action === "expense.deleted" ? null : { kind: "expenses", id: null };
        break;
      }
      case "task": {
        const t = id ? tasks.get(id) : undefined;
        item.subject = str(m.title) ?? t?.title ?? null;
        item.other = (str(m.assigneeId) && users.get(str(m.assigneeId)!)?.name) ?? null;
        item.detail = r.action === "task.done" ? (t?.event_title ?? null) : null;
        item.late = m.late === true;
        if (r.action === "task.deadline_moved" && str(m.to)) item.detail = `to ${formatDate(str(m.to)!, { year: false })}`;
        if (r.action === "task.stuck" || r.action === "task.sent_back") item.detail = str(m.reason) ?? null;
        item.link = t?.event_id ? { kind: "event", id: t.event_id } : { kind: "tasks", id: id ?? null };
        break;
      }
      case "time_off": {
        const whose = str(m.userId);
        // Your own days off read "will be off 3–5 Oct"; someone else's name them.
        item.other = whose && whose !== r.actor_user_id ? (users.get(whose)?.name ?? null) : null;
        const [start, end] = [str(m.startDate), str(m.endDate)];
        item.detail = start && end ? formatDateRange(start, end) : null;
        item.link = { kind: "team", id: null };
        break;
      }
      case "lead":
        item.subject = (id && leads.get(id)?.name) ?? null;
        item.link = id ? { kind: "lead", id } : null;
        if (r.action === "lead.stage_changed") item.detail = str(m.to);
        else if (r.action === "lead.assigned") item.other = str(m.toName);
        else if (r.action === "lead.created") {
          item.detail = m.source === "enquiry_form" || m.via === "enquiry_form" ? "enquiry form" : null;
          item.other = str(m.referrer);
        }
        else if (r.body) item.detail = r.body.length > 140 ? `${r.body.slice(0, 139)}…` : r.body;
        break;
    }
    return item;
  });

  return { items, next: rows.length > PAGE ? encode(page[page.length - 1]!) : null };
}
