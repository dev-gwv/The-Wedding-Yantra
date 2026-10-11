import { can } from "@wedding-yantra/core";
import type { LeadRouting, LeadRoutingInput } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { membersWithLeads, previewPool, routingSettings } from "./routing.js";

const requireOwner = (ctx: MemberContext) => {
  if (!can(ctx, "members.hr")) throw forbidden("Only the owner chooses who gets Facebook leads");
};

async function names(db: Queryable, userIds: string[]): Promise<Map<string, string | null>> {
  if (!userIds.length) return new Map();
  const { rows } = await db.query<{ id: string; name: string | null }>(`SELECT id, name FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** "Arfin Khan", "Arfin Khan and Bina Shah", "Arfin Khan, Bina Shah and Ravi Verma" */
function joinNames(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Who gets the Facebook and Instagram leads, and who would get them now. Owner only. */
export async function getLeadRouting(db: Queryable, ctx: MemberContext, now = new Date()): Promise<LeadRouting> {
  requireOwner(ctx);
  const settings = await routingSettings(db, ctx.workspaceId);
  // Only people who can still take leads: someone who left or lost the Leads screen drops off.
  const eligible = await membersWithLeads(db, ctx.workspaceId, settings.people);
  const people = settings.people.filter((id) => eligible.has(id));
  const named = await names(db, people);
  return {
    everyoneWithLeads: settings.everyoneWithLeads,
    people: people.map((userId) => ({ userId, name: named.get(userId) ?? null })),
    includeOwner: settings.includeOwner,
    skipOnLeave: settings.skipOnLeave,
    pool: await previewPool(db, ctx.workspaceId, now),
  };
}

export async function setLeadRouting(db: Db, ctx: MemberContext, input: LeadRoutingInput, now = new Date()): Promise<LeadRouting> {
  requireOwner(ctx);
  const people = [...new Set(input.people)];
  if (!input.everyoneWithLeads && people.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Pick at least one person, or give leads to everyone with Leads", {
      people: "Pick at least one person",
    });
  }

  return withTransaction(db, async (tx) => {
    // Each person must be on the team now, with the Leads screen.
    const eligible = await membersWithLeads(tx, ctx.workspaceId, people);
    if (people.some((id) => !eligible.has(id))) {
      throw new AppError(400, "VALIDATION_ERROR", "Choose people who have the Leads screen", {
        people: "Choose people who have the Leads screen",
      });
    }
    await tx.query(
      `INSERT INTO lead_routing (workspace_id, people, everyone_with_leads, include_owner, skip_on_leave, updated_by)
       VALUES ($1, $2::uuid[], $3, $4, $5, $6)
       ON CONFLICT (workspace_id) DO UPDATE
         SET people = EXCLUDED.people, everyone_with_leads = EXCLUDED.everyone_with_leads, include_owner = EXCLUDED.include_owner,
             skip_on_leave = EXCLUDED.skip_on_leave, updated_by = EXCLUDED.updated_by`,
      [ctx.workspaceId, people, input.everyoneWithLeads, input.includeOwner, input.skipOnLeave, ctx.userId],
    );
    const named = await names(tx, people);
    const who = input.everyoneWithLeads
      ? `everyone with Leads${input.includeOwner ? ", including the owner" : ""}`
      : joinNames(people.map((id) => named.get(id) ?? "someone"));
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "lead_routing.changed",
      entityType: "lead_routing",
      entityId: ctx.workspaceId,
      meta: { summary: who, skipOnLeave: input.skipOnLeave },
    });
    return getLeadRouting(tx, ctx, now);
  });
}
