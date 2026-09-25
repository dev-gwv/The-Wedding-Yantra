import { can } from "@wedding-yantra/core";
import type { LeadFormSettings, PipelineStage, StageKind, WhatsAppTemplate } from "@wedding-yantra/types";
import { withTransaction, type Db } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { listStages } from "./leads.js";

const requireSettings = (ctx: MemberContext) => {
  if (!can(ctx.role, "workspace.update")) throw forbidden("Only the owner or a manager can change sales settings");
};

// ---- Sales stages -----------------------------------------------------------

/**
 * Saves the whole list of stages in order. Stages missing from the list are removed,
 * but only when no lead sits in them, so no lead is ever lost.
 */
export async function saveStages(
  db: Db,
  ctx: MemberContext,
  stages: { id?: string; name: string; kind: StageKind }[],
): Promise<PipelineStage[]> {
  requireSettings(ctx);
  return withTransaction(db, async (tx) => {
    const existing = await tx.query<{ id: string; name: string }>(
      `SELECT id, name FROM pipeline_stages WHERE workspace_id = $1`,
      [ctx.workspaceId],
    );
    const known = new Map(existing.rows.map((r) => [r.id, r.name]));
    const keep = new Set(stages.map((s) => s.id).filter((id): id is string => !!id));
    for (const id of keep) if (!known.has(id)) throw notFound("That stage");

    for (const [id, name] of known) {
      if (keep.has(id)) continue;
      const inUse = await tx.query(`SELECT 1 FROM leads WHERE stage_id = $1 AND deleted_at IS NULL LIMIT 1`, [id]);
      if (inUse.rowCount) {
        throw new AppError(409, "STAGE_IN_USE", `Move the leads out of "${name}" before removing it`);
      }
    }

    // Park positions out of the way first so reordering never trips over itself.
    await tx.query(`UPDATE pipeline_stages SET position = position + 1000 WHERE workspace_id = $1`, [ctx.workspaceId]);
    const ids: string[] = [];
    for (const [position, stage] of stages.entries()) {
      if (stage.id) {
        await tx.query(`UPDATE pipeline_stages SET name = $2, kind = $3, position = $4 WHERE id = $1`, [
          stage.id,
          stage.name,
          stage.kind,
          position,
        ]);
        ids.push(stage.id);
      } else {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO pipeline_stages (workspace_id, name, kind, position) VALUES ($1, $2, $3, $4) RETURNING id`,
          [ctx.workspaceId, stage.name, stage.kind, position],
        );
        ids.push(rows[0]!.id);
      }
    }

    const removed = [...known.keys()].filter((id) => !keep.has(id));
    if (removed.length > 0) {
      // Deleted leads may still point at a removed stage; park them on the first stage.
      await tx.query(`UPDATE leads SET stage_id = $2 WHERE stage_id = ANY($1::uuid[])`, [removed, ids[0]]);
      await tx.query(`DELETE FROM pipeline_stages WHERE id = ANY($1::uuid[])`, [removed]);
    }
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "sales.stages_updated",
      entityType: "workspace",
      entityId: ctx.workspaceId,
    });
    return listStages(tx, ctx);
  });
}

// ---- WhatsApp quick replies -------------------------------------------------

export async function listTemplates(db: Db, ctx: MemberContext): Promise<WhatsAppTemplate[]> {
  if (!can(ctx.role, "leads.work")) throw forbidden();
  const { rows } = await db.query<WhatsAppTemplate>(
    `SELECT id, title, body, position FROM whatsapp_templates WHERE workspace_id = $1 ORDER BY position, created_at`,
    [ctx.workspaceId],
  );
  return rows;
}

export async function createTemplate(db: Db, ctx: MemberContext, input: { title: string; body: string }) {
  requireSettings(ctx);
  const { rows } = await db.query<WhatsAppTemplate>(
    `INSERT INTO whatsapp_templates (workspace_id, title, body, position)
     VALUES ($1, $2, $3, (SELECT coalesce(max(position), -1) + 1 FROM whatsapp_templates WHERE workspace_id = $1))
     RETURNING id, title, body, position`,
    [ctx.workspaceId, input.title, input.body],
  );
  return rows[0]!;
}

export async function updateTemplate(db: Db, ctx: MemberContext, id: string, input: { title?: string; body?: string }) {
  requireSettings(ctx);
  const { rows } = await db.query<WhatsAppTemplate>(
    `UPDATE whatsapp_templates SET title = coalesce($3, title), body = coalesce($4, body)
      WHERE id = $1 AND workspace_id = $2
      RETURNING id, title, body, position`,
    [id, ctx.workspaceId, input.title ?? null, input.body ?? null],
  );
  if (!rows[0]) throw notFound("This quick reply");
  return rows[0];
}

export async function deleteTemplate(db: Db, ctx: MemberContext, id: string) {
  requireSettings(ctx);
  const { rowCount } = await db.query(`DELETE FROM whatsapp_templates WHERE id = $1 AND workspace_id = $2`, [
    id,
    ctx.workspaceId,
  ]);
  if (!rowCount) throw notFound("This quick reply");
}

// ---- Enquiry form -----------------------------------------------------------

export async function getLeadForm(db: Db, ctx: MemberContext): Promise<LeadFormSettings> {
  if (!can(ctx.role, "leads.work")) throw forbidden();
  const { rows } = await db.query<LeadFormSettings>(`SELECT slug, enabled FROM lead_forms WHERE workspace_id = $1`, [
    ctx.workspaceId,
  ]);
  if (!rows[0]) throw notFound("The enquiry form");
  return rows[0];
}

export async function setLeadFormEnabled(db: Db, ctx: MemberContext, enabled: boolean): Promise<LeadFormSettings> {
  requireSettings(ctx);
  const { rows } = await db.query<LeadFormSettings>(
    `UPDATE lead_forms SET enabled = $2 WHERE workspace_id = $1 RETURNING slug, enabled`,
    [ctx.workspaceId, enabled],
  );
  if (!rows[0]) throw notFound("The enquiry form");
  return rows[0];
}
