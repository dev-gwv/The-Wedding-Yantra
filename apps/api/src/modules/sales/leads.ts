import { can, leadScope } from "@wedding-yantra/core";
import type {
  FollowUpState,
  Lead,
  LeadActivity,
  LeadList,
  LeadSummary,
  LostReason,
  PipelineStage,
  StageKind,
} from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Columns for a lead card. The follow-up state is worked out in the business's time zone. */
const SUMMARY_COLUMNS = `
  l.id, l.name, l.phone, l.event_type, l.event_date, l.city, l.budget, l.source,
  l.stage_id, s.name AS stage_name, s.kind AS stage_kind,
  l.assigned_to, au.name AS assigned_name,
  l.next_follow_up_at, l.client_id, l.created_at, l.updated_at,
  CASE
    WHEN l.next_follow_up_at IS NULL OR s.kind <> 'open' THEN 'none'
    WHEN (l.next_follow_up_at AT TIME ZONE w.timezone)::date < (now() AT TIME ZONE w.timezone)::date THEN 'overdue'
    WHEN (l.next_follow_up_at AT TIME ZONE w.timezone)::date = (now() AT TIME ZONE w.timezone)::date THEN 'today'
    ELSE 'upcoming'
  END AS follow_up_state`;

const FROM = `
  FROM leads l
  JOIN pipeline_stages s ON s.id = l.stage_id
  JOIN workspaces w ON w.id = l.workspace_id
  LEFT JOIN users au ON au.id = l.assigned_to`;

export interface SummaryRow {
  id: string;
  name: string;
  phone: string | null;
  event_type: LeadSummary["eventType"];
  event_date: string | null;
  city: string | null;
  budget: string | null;
  source: LeadSummary["source"];
  stage_id: string;
  stage_name: string;
  stage_kind: StageKind;
  assigned_to: string | null;
  assigned_name: string | null;
  next_follow_up_at: Date | null;
  client_id: string | null;
  created_at: Date;
  updated_at: Date;
  follow_up_state: FollowUpState;
}

export const toSummary = (r: SummaryRow): LeadSummary => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  eventType: r.event_type,
  eventDate: r.event_date,
  city: r.city,
  budget: r.budget === null ? null : Number(r.budget),
  source: r.source,
  stageId: r.stage_id,
  stageName: r.stage_name,
  stageKind: r.stage_kind,
  assignedTo: r.assigned_to ? { id: r.assigned_to, name: r.assigned_name } : null,
  nextFollowUpAt: r.next_follow_up_at?.toISOString() ?? null,
  followUpState: r.follow_up_state,
  clientId: r.client_id,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

/** Adds the "which leads can this person see" condition. Returns the SQL to AND in. */
export function scopeCondition(ctx: MemberContext, params: unknown[]): string {
  const scope = leadScope(ctx.role);
  if (scope === "none") throw forbidden("Your role doesn't include leads");
  if (scope === "all") return "TRUE";
  params.push(ctx.userId);
  const p = `$${params.length}`;
  return `(l.assigned_to = ${p} OR l.created_by = ${p})`;
}

export interface ListFilters {
  stageId?: string;
  q?: string;
  followUp?: "due" | "overdue" | "today" | "upcoming";
  mine?: boolean;
}

export async function listLeads(db: Db, ctx: MemberContext, filters: ListFilters): Promise<LeadList> {
  const params: unknown[] = [ctx.workspaceId];
  const where = ["l.workspace_id = $1", "l.deleted_at IS NULL", scopeCondition(ctx, params)];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.stageId) where.push(`l.stage_id = ${add(filters.stageId)}`);
  if (filters.mine) where.push(`l.assigned_to = ${add(ctx.userId)}`);
  if (filters.q) {
    const byName = `l.name ILIKE ${add(`%${filters.q.replace(/[%_\\]/g, "\\$&")}%`)}`;
    const digits = filters.q.replace(/\D/g, "");
    where.push(digits.length >= 3 ? `(${byName} OR l.phone LIKE ${add(`%${digits}%`)})` : byName);
  }

  let sql = `SELECT ${SUMMARY_COLUMNS} ${FROM} WHERE ${where.join(" AND ")} ORDER BY s.position, l.updated_at DESC LIMIT 500`;
  if (filters.followUp) {
    const states = filters.followUp === "due" ? ["overdue", "today"] : [filters.followUp];
    sql = `SELECT * FROM (SELECT ${SUMMARY_COLUMNS} ${FROM} WHERE ${where.join(" AND ")}) x
            WHERE x.follow_up_state = ANY(${add(states)}::text[])
            ORDER BY x.next_follow_up_at ASC LIMIT 500`;
  }

  const { rows } = await db.query<SummaryRow>(sql, params);
  return { stages: await listStages(db, ctx), leads: rows.map(toSummary) };
}

/** Every stage with how many of *your* leads sit in it and what they're worth. */
export async function listStages(db: Queryable, ctx: MemberContext): Promise<PipelineStage[]> {
  const params: unknown[] = [ctx.workspaceId];
  const scope = scopeCondition(ctx, params);
  const { rows } = await db.query<{
    id: string;
    name: string;
    position: number;
    kind: StageKind;
    lead_count: string;
    value: string | null;
  }>(
    `SELECT s.id, s.name, s.position, s.kind,
            count(l.id) AS lead_count, coalesce(sum(l.budget), 0) AS value
       FROM pipeline_stages s
       LEFT JOIN leads l ON l.stage_id = s.id AND l.deleted_at IS NULL AND ${scope}
      WHERE s.workspace_id = $1
      GROUP BY s.id
      ORDER BY s.position`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    kind: r.kind,
    leadCount: Number(r.lead_count),
    value: Number(r.value ?? 0),
  }));
}

interface LeadRow extends SummaryRow {
  email: string | null;
  venue: string | null;
  guest_count: number | null;
  referred_by: string | null;
  requirements: string | null;
  lost_reason: LostReason | null;
  created_by: string | null;
  created_by_name: string | null;
}

/** Loads one lead the person is allowed to see, or throws "not found". */
async function loadVisible(db: Queryable, ctx: MemberContext, leadId: string): Promise<LeadRow> {
  const params: unknown[] = [ctx.workspaceId, leadId];
  const scope = scopeCondition(ctx, params);
  const { rows } = await db.query<LeadRow>(
    `SELECT ${SUMMARY_COLUMNS}, l.email, l.venue, l.guest_count, l.referred_by, l.requirements,
            l.lost_reason, l.created_by, cu.name AS created_by_name
       ${FROM}
       LEFT JOIN users cu ON cu.id = l.created_by
      WHERE l.workspace_id = $1 AND l.id = $2 AND l.deleted_at IS NULL AND ${scope}`,
    params,
  );
  if (!rows[0]) throw notFound("This lead");
  return rows[0];
}

export async function getLead(db: Queryable, ctx: MemberContext, leadId: string): Promise<Lead> {
  const r = await loadVisible(db, ctx, leadId);
  const activities = await db.query<{
    id: string;
    kind: LeadActivity["kind"];
    body: string | null;
    meta: Record<string, unknown>;
    actor_user_id: string | null;
    actor_name: string | null;
    created_at: Date;
  }>(
    `SELECT a.id, a.kind, a.body, a.meta, a.actor_user_id, u.name AS actor_name, a.created_at
       FROM lead_activities a
       LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.lead_id = $1
      ORDER BY a.created_at DESC
      LIMIT 200`,
    [leadId],
  );
  return {
    ...toSummary(r),
    email: r.email,
    venue: r.venue,
    guestCount: r.guest_count,
    referredBy: r.referred_by,
    requirements: r.requirements,
    lostReason: r.lost_reason,
    createdBy: r.created_by ? { id: r.created_by, name: r.created_by_name } : null,
    activities: activities.rows.map((a) => ({
      id: a.id,
      kind: a.kind,
      body: a.body,
      meta: a.meta,
      actor: a.actor_user_id ? { id: a.actor_user_id, name: a.actor_name } : null,
      createdAt: a.created_at.toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function addActivityRow(
  db: Queryable,
  ctx: { workspaceId: string; userId: string | null },
  leadId: string,
  kind: LeadActivity["kind"],
  body: string | null = null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await db.query(
    `INSERT INTO lead_activities (workspace_id, lead_id, actor_user_id, kind, body, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ctx.workspaceId, leadId, ctx.userId, kind, body, meta],
  );
}

async function loadStage(db: Queryable, workspaceId: string, stageId: string) {
  const { rows } = await db.query<{ id: string; name: string; kind: StageKind }>(
    `SELECT id, name, kind FROM pipeline_stages WHERE id = $1 AND workspace_id = $2`,
    [stageId, workspaceId],
  );
  if (!rows[0]) throw new AppError(400, "VALIDATION_ERROR", "Pick a stage", { stageId: "Pick a stage" });
  return rows[0];
}

export async function firstOpenStage(db: Queryable, workspaceId: string) {
  const { rows } = await db.query<{ id: string; name: string; kind: StageKind }>(
    `SELECT id, name, kind FROM pipeline_stages WHERE workspace_id = $1 AND kind = 'open' ORDER BY position LIMIT 1`,
    [workspaceId],
  );
  if (!rows[0]) throw new AppError(409, "NO_STAGES", "Set up your sales stages first");
  return rows[0];
}

/** Checks that someone is an active member before a lead is given to them. */
async function assertMember(db: Queryable, workspaceId: string, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ name: string | null }>(
    `SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.removed_at IS NULL`,
    [workspaceId, userId],
  );
  if (!rows[0]) {
    throw new AppError(400, "VALIDATION_ERROR", "Pick someone from your team", {
      assignedToUserId: "Pick someone from your team",
    });
  }
  return rows[0].name;
}

export interface LeadFields {
  name?: string;
  phone?: string | null;
  email?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  city?: string | null;
  venue?: string | null;
  guestCount?: number | null;
  budget?: number | null;
  source?: string;
  referredBy?: string | null;
  requirements?: string | null;
  stageId?: string;
  assignedToUserId?: string | null;
  nextFollowUpAt?: string | null;
  lostReason?: LostReason | null;
}

const COLUMNS: [keyof LeadFields, string][] = [
  ["name", "name"],
  ["phone", "phone"],
  ["email", "email"],
  ["eventType", "event_type"],
  ["eventDate", "event_date"],
  ["city", "city"],
  ["venue", "venue"],
  ["guestCount", "guest_count"],
  ["budget", "budget"],
  ["source", "source"],
  ["referredBy", "referred_by"],
  ["requirements", "requirements"],
];

export async function createLead(db: Db, ctx: MemberContext, input: LeadFields): Promise<Lead> {
  if (!can(ctx.role, "leads.work")) throw forbidden("Your role doesn't include leads");

  return withTransaction(db, async (tx) => {
    const stage = input.stageId ? await loadStage(tx, ctx.workspaceId, input.stageId) : await firstOpenStage(tx, ctx.workspaceId);
    if (stage.kind !== "open") {
      throw new AppError(400, "VALIDATION_ERROR", "New leads start in an open stage", { stageId: "Pick an open stage" });
    }

    // New leads belong to whoever adds them, unless a manager gives them to someone.
    let assignee: string | null = ctx.userId;
    if (input.assignedToUserId !== undefined && input.assignedToUserId !== ctx.userId) {
      if (!can(ctx.role, "leads.assign")) throw forbidden("Only the owner or a manager can give leads to others");
      if (input.assignedToUserId) await assertMember(tx, ctx.workspaceId, input.assignedToUserId);
      assignee = input.assignedToUserId;
    }

    const cols = ["workspace_id", "stage_id", "assigned_to", "created_by", "next_follow_up_at"];
    const values: unknown[] = [ctx.workspaceId, stage.id, assignee, ctx.userId, input.nextFollowUpAt ?? null];
    for (const [key, column] of COLUMNS) {
      if (input[key] === undefined) continue;
      cols.push(column);
      values.push(input[key]);
    }
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO leads (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
      values,
    );
    const id = rows[0]!.id;
    await addActivityRow(tx, ctx, id, "created", null, { source: input.source ?? "other" });
    return getLead(tx, ctx, id);
  });
}

/** Finds the client with this phone number, or creates one, and returns its id. */
export async function upsertClientForLead(
  db: Queryable,
  ctx: { workspaceId: string; userId: string | null },
  lead: { name: string; phone: string | null; email: string | null; city: string | null },
): Promise<string> {
  if (lead.phone) {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM clients WHERE workspace_id = $1 AND phone = $2 AND deleted_at IS NULL`,
      [ctx.workspaceId, lead.phone],
    );
    if (existing.rows[0]) return existing.rows[0].id;
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO clients (workspace_id, name, phone, email, city, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [ctx.workspaceId, lead.name, lead.phone, lead.email, lead.city, ctx.userId],
  );
  return rows[0]!.id;
}

export async function updateLead(db: Db, ctx: MemberContext, leadId: string, input: LeadFields): Promise<Lead> {
  if (!can(ctx.role, "leads.work")) throw forbidden("Your role doesn't include leads");

  return withTransaction(db, async (tx) => {
    const current = await loadVisible(tx, ctx, leadId);
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    for (const [key, column] of COLUMNS) {
      if (input[key] !== undefined) set(column, input[key]);
    }

    // Moving between stages
    if (input.stageId && input.stageId !== current.stage_id) {
      const stage = await loadStage(tx, ctx.workspaceId, input.stageId);
      if (stage.kind === "lost") {
        const reason = input.lostReason ?? current.lost_reason;
        if (!reason) {
          throw new AppError(400, "VALIDATION_ERROR", "Tell us why this lead was lost", {
            lostReason: "Tell us why this lead was lost",
          });
        }
        set("lost_reason", reason);
      } else {
        set("lost_reason", null);
      }
      if (stage.kind === "won" && !current.client_id) {
        const clientId = await upsertClientForLead(tx, ctx, {
          name: input.name ?? current.name,
          phone: input.phone !== undefined ? input.phone : current.phone,
          email: input.email !== undefined ? input.email : current.email,
          city: input.city !== undefined ? input.city : current.city,
        });
        set("client_id", clientId);
      }
      if (stage.kind !== "open") set("next_follow_up_at", null);
      set("stage_id", stage.id);
      sets.push("stage_changed_at = now()");
      await addActivityRow(tx, ctx, leadId, "stage_changed", null, {
        from: current.stage_name,
        to: stage.name,
        kind: stage.kind,
        ...(stage.kind === "lost" ? { reason: input.lostReason ?? current.lost_reason } : {}),
      });
    } else if (input.lostReason !== undefined && current.stage_kind === "lost") {
      set("lost_reason", input.lostReason);
    }

    // Follow-up date (ignored once a lead is booked or lost)
    const stageIsOpen = !sets.some((s) => s.startsWith("next_follow_up_at"));
    if (input.nextFollowUpAt !== undefined && stageIsOpen) {
      const before = current.next_follow_up_at?.toISOString() ?? null;
      if (input.nextFollowUpAt !== before) {
        set("next_follow_up_at", input.nextFollowUpAt);
        await addActivityRow(tx, ctx, leadId, "follow_up_set", null, { at: input.nextFollowUpAt });
      }
    }

    // Giving the lead to someone else
    if (input.assignedToUserId !== undefined && input.assignedToUserId !== current.assigned_to) {
      if (!can(ctx.role, "leads.assign")) throw forbidden("Only the owner or a manager can give leads to others");
      const toName = input.assignedToUserId ? await assertMember(tx, ctx.workspaceId, input.assignedToUserId) : null;
      set("assigned_to", input.assignedToUserId);
      await addActivityRow(tx, ctx, leadId, "assigned", null, { to: input.assignedToUserId, toName });
    }

    if (sets.length > 0) {
      values.push(leadId, ctx.workspaceId);
      await tx.query(
        `UPDATE leads SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND workspace_id = $${values.length}`,
        values,
      );
    }
    return getLead(tx, ctx, leadId);
  });
}

export async function deleteLead(db: Db, ctx: MemberContext, leadId: string): Promise<void> {
  if (!can(ctx.role, "leads.delete")) throw forbidden("Only the owner or a manager can delete leads");
  await loadVisible(db, ctx, leadId);
  await db.query(`UPDATE leads SET deleted_at = now() WHERE id = $1 AND workspace_id = $2`, [leadId, ctx.workspaceId]);
}

export async function addActivity(
  db: Db,
  ctx: MemberContext,
  leadId: string,
  input: { kind: "note" | "call" | "whatsapp"; body?: string },
): Promise<Lead> {
  if (!can(ctx.role, "leads.work")) throw forbidden("Your role doesn't include leads");
  await loadVisible(db, ctx, leadId);
  if (input.kind === "note" && !input.body) {
    throw new AppError(400, "VALIDATION_ERROR", "Write a note", { body: "Write a note" });
  }
  await addActivityRow(db, ctx, leadId, input.kind, input.body || null);
  await db.query(`UPDATE leads SET updated_at = now() WHERE id = $1`, [leadId]);
  return getLead(db, ctx, leadId);
}

/** Numbers and the short to-do list for the Home screen. */
export async function salesSummary(db: Db, ctx: MemberContext) {
  const scope = leadScope(ctx.role);
  if (scope === "none") return { overdue: 0, dueToday: 0, newLeads: 0, openValue: 0, due: [] };

  const params: unknown[] = [ctx.workspaceId];
  const scopeSql = scopeCondition(ctx, params);
  const { rows } = await db.query<{ overdue: string; due_today: string; new_leads: string; open_value: string }>(
    `WITH mine AS (SELECT ${SUMMARY_COLUMNS}, s.position ${FROM}
                    WHERE l.workspace_id = $1 AND l.deleted_at IS NULL AND ${scopeSql})
     SELECT count(*) FILTER (WHERE follow_up_state = 'overdue') AS overdue,
            count(*) FILTER (WHERE follow_up_state = 'today') AS due_today,
            count(*) FILTER (WHERE stage_id = (SELECT id FROM pipeline_stages
                                               WHERE workspace_id = $1 AND kind = 'open'
                                               ORDER BY position LIMIT 1)) AS new_leads,
            coalesce(sum(budget) FILTER (WHERE stage_kind = 'open'), 0) AS open_value
       FROM mine`,
    params,
  );
  const due = await listLeads(db, ctx, { followUp: "due" });
  const r = rows[0]!;
  return {
    overdue: Number(r.overdue),
    dueToday: Number(r.due_today),
    newLeads: Number(r.new_leads),
    openValue: Number(r.open_value),
    due: due.leads.slice(0, 5),
  };
}
