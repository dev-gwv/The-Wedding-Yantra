import { can, leadScope } from "@wedding-yantra/core";
import type { PhoneMatch } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { forbidden } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { phoneKey, phoneKeySql } from "./public-form.js";

const LIMIT = 5;

/**
 * Who already has this phone number: shown before someone adds the same person again.
 * Matches on the last 10 digits, like a repeat enquiry does. A lead the person can't open
 * still shows its name (with no id) so they know to ask whoever has it; clients show only
 * to people with the Clients screen.
 */
export async function phoneMatch(db: Queryable, ctx: MemberContext, phone: string): Promise<PhoneMatch> {
  const seesClients = can(ctx, "clients.view");
  if (!can(ctx, "leads.work") && !seesClients) throw forbidden("Leads and clients aren't on your screens. Ask the owner to add them for you");
  const key = phoneKey(phone);
  // Too short to be a number: nothing can match it safely.
  if (key.length < 6) return { leads: [], clients: [] };

  const scope = leadScope(ctx);
  const [leads, clients] = await Promise.all([
    db.query<{ id: string; name: string; stage_name: string | null; assigned_name: string | null; created_at: Date; opens: boolean }>(
      `SELECT l.id, l.name, s.name AS stage_name, au.name AS assigned_name, l.created_at,
              ${scope === "all" ? "TRUE" : scope === "own" ? "(l.assigned_to = $3 OR l.created_by = $3)" : "FALSE"} AS opens
         FROM leads l
         LEFT JOIN pipeline_stages s ON s.id = l.stage_id
         LEFT JOIN users au ON au.id = l.assigned_to
        WHERE l.workspace_id = $1 AND l.deleted_at IS NULL AND ${phoneKeySql("l.phone")} = $2
        ORDER BY l.created_at DESC LIMIT ${LIMIT}`,
      scope === "own" ? [ctx.workspaceId, key, ctx.userId] : [ctx.workspaceId, key],
    ),
    seesClients
      ? db.query<{ id: string; name: string }>(
          `SELECT c.id, c.name FROM clients c
            WHERE c.workspace_id = $1 AND c.deleted_at IS NULL
              -- The family's number, or one of its contacts' (the groom, a parent).
              AND (${phoneKeySql("c.phone")} = $2
                   OR EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.client_id = c.id AND ${phoneKeySql("cc.phone")} = $2))
            ORDER BY c.created_at DESC LIMIT ${LIMIT}`,
          [ctx.workspaceId, key],
        )
      : null,
  ]);
  return {
    leads: leads.rows.map((r) => ({
      id: r.opens ? r.id : null,
      name: r.name,
      stageName: r.stage_name,
      assignedToName: r.assigned_name,
      createdAt: r.created_at.toISOString(),
    })),
    clients: clients?.rows.map((r) => ({ id: r.id, name: r.name })) ?? [],
  };
}
