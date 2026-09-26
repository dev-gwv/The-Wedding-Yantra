import { can, leadScope } from "@wedding-yantra/core";
import type { Client, ClientSummary } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { writeCustom } from "../fields/service.js";
import { scopeCondition, toSummary, type SummaryRow } from "./leads.js";

interface ClientRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
  portal_token: string | null;
  custom: Record<string, string | number | boolean | null>;
  no_messages: boolean;
  lead_count: string;
  created_at: Date;
}

const toClientSummary = (r: ClientRow): ClientSummary => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  email: r.email,
  city: r.city,
  leadCount: Number(r.lead_count),
  createdAt: r.created_at.toISOString(),
});

const SELECT = `
  SELECT c.id, c.name, c.phone, c.email, c.city, c.notes, c.portal_token, c.custom, c.no_messages, c.created_at,
         (SELECT count(*) FROM leads l WHERE l.client_id = c.id AND l.deleted_at IS NULL) AS lead_count
    FROM clients c`;

function duplicatePhone(err: unknown): never {
  if ((err as { code?: string }).code === "23505") {
    const message = "A client with this number already exists";
    throw new AppError(409, "DUPLICATE_CLIENT", message, { phone: message });
  }
  throw err;
}

export async function listClients(db: Db, ctx: MemberContext, q?: string): Promise<ClientSummary[]> {
  if (!can(ctx.role, "clients.view")) throw forbidden("Your role doesn't include clients");
  const params: unknown[] = [ctx.workspaceId];
  let filter = "";
  if (q) {
    params.push(`%${q.replace(/[%_\\]/g, "\\$&")}%`);
    const digits = q.replace(/\D/g, "");
    filter = ` AND (c.name ILIKE $2${digits.length >= 3 ? " OR c.phone LIKE $3" : ""})`;
    if (digits.length >= 3) params.push(`%${digits}%`);
  }
  const { rows } = await db.query<ClientRow>(
    `${SELECT} WHERE c.workspace_id = $1 AND c.deleted_at IS NULL${filter} ORDER BY c.created_at DESC LIMIT 500`,
    params,
  );
  return rows.map(toClientSummary);
}

export async function getClient(db: Db, ctx: MemberContext, clientId: string): Promise<Client> {
  if (!can(ctx.role, "clients.view")) throw forbidden("Your role doesn't include clients");
  const { rows } = await db.query<ClientRow>(
    `${SELECT} WHERE c.workspace_id = $1 AND c.id = $2 AND c.deleted_at IS NULL`,
    [ctx.workspaceId, clientId],
  );
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
  const [leads, referredLeads] = await Promise.all([leadsWhere("client_id"), leadsWhere("referred_by_client_id")]);
  return {
    ...toClientSummary(row),
    notes: row.notes,
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
}

export async function createClient(db: Db, ctx: MemberContext, input: Required<Pick<ClientFields, "name">> & ClientFields) {
  if (!can(ctx.role, "clients.manage")) throw forbidden("Only the owner or a manager can add clients");
  const { rows } = await db
    .query<{ id: string }>(
      `INSERT INTO clients (workspace_id, name, phone, email, city, notes, no_messages, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [ctx.workspaceId, input.name, input.phone ?? null, input.email ?? null, input.city ?? null, input.notes ?? null, input.noMessages ?? false, ctx.userId],
    )
    .catch(duplicatePhone);
  await writeCustom(db, ctx.workspaceId, "client", rows[0]!.id, input.custom);
  return getClient(db, ctx, rows[0]!.id);
}

export async function updateClient(db: Db, ctx: MemberContext, clientId: string, input: ClientFields) {
  if (!can(ctx.role, "clients.manage")) throw forbidden("Only the owner or a manager can change clients");
  const columns: [keyof ClientFields, string][] = [
    ["name", "name"],
    ["phone", "phone"],
    ["email", "email"],
    ["city", "city"],
    ["notes", "notes"],
    ["noMessages", "no_messages"],
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of columns) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length > 0) {
    values.push(clientId, ctx.workspaceId);
    const result = await db
      .query(
        `UPDATE clients SET ${sets.join(", ")}
          WHERE id = $${values.length - 1} AND workspace_id = $${values.length} AND deleted_at IS NULL`,
        values,
      )
      .catch(duplicatePhone);
    if (!result.rowCount) throw notFound("This client");
  }
  const exists = await db.query(`SELECT 1 FROM clients WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [clientId, ctx.workspaceId]);
  if (!exists.rowCount) throw notFound("This client");
  await writeCustom(db, ctx.workspaceId, "client", clientId, input.custom);
  return getClient(db, ctx, clientId);
}
