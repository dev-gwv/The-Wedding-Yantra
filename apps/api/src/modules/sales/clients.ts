import { can, leadScope } from "@wedding-yantra/core";
import type { Client, ClientContact, ClientContactInput, ClientKind, ClientSummary, LeadSource } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { writeCustom } from "../fields/service.js";
import { assertOption } from "../options/service.js";
import { scopeCondition, toSummary, type SummaryRow } from "./leads.js";

/**
 * The client master: the person who booked us (and who they are to the wedding), who to
 * call when they can't be reached, and the wedding. Billing is filled in on each invoice.
 * Archived, never deleted, so old events and invoices keep their client.
 */

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
  kind: ClientKind;
  archived_at: Date | null;
  source: LeadSource | null;
  bride_name: string | null;
  groom_name: string | null;
  guest_count: number | null;
  relation: string | null;
  portal_token: string | null;
  custom: Record<string, string | number | boolean | null>;
  no_messages: boolean;
  wedding_date: string | null;
  lead_count: string;
  created_at: Date;
}

const toClientSummary = (r: ClientRow): ClientSummary => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  city: r.city,
  kind: r.kind,
  relation: r.relation,
  archived: r.archived_at !== null,
  weddingDate: r.wedding_date,
  leadCount: Number(r.lead_count),
  createdAt: r.created_at.toISOString(),
});

// Their next function (or, once all are past, the last one) stands for "the wedding date".
const SELECT = `
  SELECT c.id, c.name, c.phone, c.email, c.city, c.notes, c.kind, c.archived_at, c.source,
         c.bride_name, c.groom_name, c.guest_count,
         c.relation,
         c.portal_token, c.custom, c.no_messages, c.created_at,
         coalesce(
           (SELECT min(f.date) FROM events e JOIN event_functions f ON f.event_id = e.id
             WHERE e.client_id = c.id AND e.deleted_at IS NULL AND e.status <> 'cancelled'
               AND f.date >= (now() AT TIME ZONE w.timezone)::date),
           (SELECT max(f.date) FROM events e JOIN event_functions f ON f.event_id = e.id
             WHERE e.client_id = c.id AND e.deleted_at IS NULL AND e.status <> 'cancelled'))::text AS wedding_date,
         (SELECT count(*) FROM leads l WHERE l.client_id = c.id AND l.deleted_at IS NULL) AS lead_count
    FROM clients c JOIN workspaces w ON w.id = c.workspace_id`;

function duplicate(err: unknown): never {
  if ((err as { code?: string }).code === "23505") {
    const message = "A client with this number already exists";
    throw new AppError(409, "DUPLICATE_CLIENT", message, { phone: message });
  }
  throw err;
}

export async function listClients(db: Db, ctx: MemberContext, q?: string, archived = false): Promise<ClientSummary[]> {
  if (!can(ctx.role, "clients.view")) throw forbidden("Your role doesn't include clients");
  const params: unknown[] = [ctx.workspaceId];
  let filter = archived ? " AND c.archived_at IS NOT NULL" : " AND c.archived_at IS NULL";
  if (q) {
    params.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`);
    const at = params.length;
    const digits = q.replace(/\D/g, "");
    const byPhone = digits.length >= 3 ? ` OR c.phone LIKE $${at + 1} OR EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id AND cc.phone LIKE $${at + 1})` : "";
    // A family is found by any of its names: the bride, the groom, a contact.
    filter += ` AND (c.name ILIKE $${at} OR c.bride_name ILIKE $${at} OR c.groom_name ILIKE $${at}
                     OR EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id AND cc.name ILIKE $${at})${byPhone})`;
    if (digits.length >= 3) params.push(`%${digits}%`);
  }
  const { rows } = await db.query<ClientRow>(
    `${SELECT} WHERE c.workspace_id = $1 AND c.deleted_at IS NULL${filter} ORDER BY c.created_at DESC LIMIT 500`,
    params,
  );
  return rows.map(toClientSummary);
}

async function listContacts(db: Queryable, clientId: string): Promise<ClientContact[]> {
  const { rows } = await db.query<{ id: string; name: string; relation: string | null; phone: string | null }>(
    `SELECT id, name, relation, phone FROM client_contacts WHERE client_id = $1 ORDER BY position, created_at`,
    [clientId],
  );
  return rows.map((r) => ({ id: r.id, name: r.name, relation: r.relation, phone: r.phone }));
}

export async function getClient(db: Db, ctx: MemberContext, clientId: string): Promise<Client> {
  if (!can(ctx.role, "clients.view")) throw forbidden("Your role doesn't include clients");
  const { rows } = await db.query<ClientRow>(`${SELECT} WHERE c.workspace_id = $1 AND c.id = $2 AND c.deleted_at IS NULL`, [ctx.workspaceId, clientId]);
  const row = rows[0];
  if (!row) throw notFound("This client");

  // Their own enquiries, and the ones they sent our way.
  const leadsWhere = async (column: "client_id" | "referred_by_client_id") => {
    if (leadScope(ctx.role) === "none") return [];
    const params: unknown[] = [ctx.workspaceId, clientId];
    const scope = scopeCondition(ctx, params);
    const result = await db.query<SummaryRow>(
      `SELECT l.id, l.name, l.phone, l.event_type, l.event_date, l.city, l.budget, l.source,
              l.stage_id, s.name AS stage_name, s.kind AS stage_kind,
              l.assigned_to, au.name AS assigned_name, l.next_follow_up_at, l.client_id,
              l.created_at, l.updated_at, 'none' AS follow_up_state
         FROM leads l
         JOIN pipeline_stages s ON s.id = l.stage_id
         LEFT JOIN users au ON au.id = l.assigned_to
        WHERE l.workspace_id = $1 AND l.${column} = $2 AND l.deleted_at IS NULL AND ${scope}
        ORDER BY l.created_at DESC`,
      params,
    );
    return result.rows.map(toSummary);
  };
  const [leads, referredLeads, contacts] = await Promise.all([leadsWhere("client_id"), leadsWhere("referred_by_client_id"), listContacts(db, clientId)]);
  return {
    ...toClientSummary(row),
    notes: row.notes,
    source: row.source,
    contacts,
    wedding: { brideName: row.bride_name, groomName: row.groom_name, guestCount: row.guest_count },
    leads,
    referredLeads,
    custom: row.custom,
    noMessages: row.no_messages,
    // The page link lets anyone see the client's bills, so only those who share it see it.
    portalToken: can(ctx.role, "clients.manage") ? row.portal_token : null,
  };
}

export interface ClientFields {
  name?: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  notes?: string | null;
  custom?: Record<string, unknown>;
  noMessages?: boolean;
  kind?: ClientKind;
  source?: LeadSource | null;
  contacts?: ClientContactInput[];
  wedding?: { brideName?: string | null; groomName?: string | null; guestCount?: number | null };
  relation?: string | null;
  archived?: boolean;
}

/** Every column a client form can change, and where it comes from in the input. */
function columnsOf(input: ClientFields): [string, unknown][] {
  const out: [string, unknown][] = [];
  const put = (column: string, value: unknown) => {
    if (value !== undefined) out.push([column, value]);
  };
  put("name", input.name);
  put("phone", input.phone);
  put("email", input.email);
  put("city", input.city);
  put("notes", input.notes);
  put("no_messages", input.noMessages);
  put("kind", input.kind);
  put("source", input.source);
  put("bride_name", input.wedding?.brideName);
  put("groom_name", input.wedding?.groomName);
  put("guest_count", input.wedding?.guestCount);
  put("relation", input.relation);
  return out;
}

/** Relationships must be the business's own options (a hidden one is fine if it's already set). */
async function checkRelations(db: Queryable, workspaceId: string, input: ClientFields, current?: string | null) {
  if (input.relation) await assertOption(db, workspaceId, "relation", input.relation, "relation", current);
  for (const [i, c] of (input.contacts ?? []).entries()) {
    if (c.relation) await assertOption(db, workspaceId, "relation", c.relation, `contacts.${i}.relation`);
  }
}

async function saveContacts(db: Queryable, workspaceId: string, clientId: string, contacts: ClientContactInput[]) {
  await db.query(`DELETE FROM client_contacts WHERE client_id = $1`, [clientId]);
  for (const [position, c] of contacts.entries()) {
    await db.query(`INSERT INTO client_contacts (workspace_id, client_id, name, relation, phone, position) VALUES ($1, $2, $3, $4, $5, $6)`, [
      workspaceId,
      clientId,
      c.name,
      c.relation ?? null,
      c.phone ?? null,
      position,
    ]);
  }
}

export async function createClient(db: Db, ctx: MemberContext, input: Required<Pick<ClientFields, "name">> & ClientFields) {
  if (!can(ctx.role, "clients.manage")) throw forbidden("Only the owner or a manager can add clients");
  await checkRelations(db, ctx.workspaceId, input);
  const id = await withTransaction(db, async (tx) => {
    const cols = columnsOf(input);
    const { rows } = await tx
      .query<{ id: string }>(
        `INSERT INTO clients (workspace_id, created_by, ${cols.map(([c]) => c).join(", ")})
         VALUES ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) RETURNING id`,
        [ctx.workspaceId, ctx.userId, ...cols.map(([, v]) => v)],
      )
      .catch(duplicate);
    const clientId = rows[0]!.id;
    if (input.contacts) await saveContacts(tx, ctx.workspaceId, clientId, input.contacts);
    await writeCustom(tx, ctx.workspaceId, "client", clientId, input.custom);
    await logActivity(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "client.added", entityType: "client", entityId: clientId, meta: { name: input.name } });
    return clientId;
  });
  return getClient(db, ctx, id);
}

const SECTION_OF: Record<string, string> = {
  bride_name: "wedding",
  groom_name: "wedding",
  guest_count: "wedding",
  relation: "details",
};

export async function updateClient(db: Db, ctx: MemberContext, clientId: string, input: ClientFields) {
  if (!can(ctx.role, "clients.manage")) throw forbidden("Only the owner or a manager can change clients");
  const current = await db.query<{ name: string; relation: string | null; archived_at: Date | null }>(
    `SELECT name, relation, archived_at FROM clients WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`,
    [clientId, ctx.workspaceId],
  );
  const was = current.rows[0];
  if (!was) throw notFound("This client");
  await checkRelations(db, ctx.workspaceId, input, was.relation);

  await withTransaction(db, async (tx) => {
    const cols = columnsOf(input);
    if (input.archived !== undefined) cols.push(["archived_at", input.archived ? (was.archived_at ?? new Date()) : null]);
    if (cols.length) {
      await tx
        .query(`UPDATE clients SET ${cols.map(([c], i) => `${c} = $${i + 3}`).join(", ")} WHERE id = $1 AND workspace_id = $2`, [
          clientId,
          ctx.workspaceId,
          ...cols.map(([, v]) => v),
        ])
        .catch(duplicate);
    }
    if (input.contacts) await saveContacts(tx, ctx.workspaceId, clientId, input.contacts);
    await writeCustom(tx, ctx.workspaceId, "client", clientId, input.custom);

    const base = { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, entityType: "client", entityId: clientId };
    if (input.archived !== undefined && input.archived !== (was.archived_at !== null)) {
      await logActivity(tx, { ...base, action: input.archived ? "client.archived" : "client.restored", meta: { name: input.name ?? was.name } });
    }
    const changed = new Set(cols.filter(([c]) => c !== "archived_at").map(([c]) => SECTION_OF[c] ?? "details"));
    if (input.contacts) changed.add("family contacts");
    if (changed.size) {
      await logActivity(tx, { ...base, action: "client.updated", meta: { name: input.name ?? was.name, what: [...changed].join(", ") } });
    }
  });
  return getClient(db, ctx, clientId);
}
