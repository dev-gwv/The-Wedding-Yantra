import { resolveAccess, type ResolvedAccess, type Role } from "@wedding-yantra/core";
import type { Queryable } from "../../db.js";

/**
 * What decides someone's access, read alongside their membership `m`: their department (and
 * whether its screens are on), the department's screens and their own extra screens.
 */
export const ACCESS_JOINS = `
  LEFT JOIN member_details md ON md.membership_id = m.id
  LEFT JOIN department_access da ON da.workspace_id = m.workspace_id AND da.department = md.department
  LEFT JOIN custom_options dpt ON dpt.workspace_id = m.workspace_id AND dpt.list = 'department' AND dpt.key = md.department`;

export const ACCESS_COLUMNS = `m.role, md.department, coalesce(md.department_on, false) AS department_on,
  da.areas AS department_areas, m.extra_areas, dpt.label AS department_label`;

export interface AccessRow {
  role: Role;
  department: string | null;
  department_on: boolean;
  department_areas: string[] | null;
  extra_areas: string[] | null;
  department_label: string | null;
}

export interface PersonAccess extends ResolvedAccess {
  department: string | null;
  departmentLabel: string | null;
  departmentOn: boolean;
}

export function accessFrom(row: AccessRow): PersonAccess {
  const resolved = resolveAccess({
    role: row.role,
    department: row.department,
    departmentOn: row.department_on,
    departmentAreas: row.department_areas,
    extraAreas: row.extra_areas,
  });
  return { ...resolved, department: row.department, departmentLabel: row.department_label, departmentOn: row.department_on };
}

/** The fields the apps get about the signed-in person's access. */
export const accessFields = (a: PersonAccess) => ({
  permissions: a.permissions,
  areas: a.areas,
  accessSource: a.source,
  department: a.department,
  departmentLabel: a.departmentLabel,
  departmentOn: a.departmentOn,
});

/** Access for several active members of a business at once, by user id. */
export async function loadAccess(db: Queryable, workspaceId: string, userIds?: string[]): Promise<Map<string, PersonAccess>> {
  const params: unknown[] = [workspaceId];
  let only = "";
  if (userIds) {
    if (userIds.length === 0) return new Map();
    params.push(userIds);
    only = "AND m.user_id = ANY($2::uuid[])";
  }
  const { rows } = await db.query<AccessRow & { user_id: string }>(
    `SELECT m.user_id, ${ACCESS_COLUMNS}
       FROM memberships m ${ACCESS_JOINS}
      WHERE m.workspace_id = $1 AND m.removed_at IS NULL ${only}`,
    params,
  );
  return new Map(rows.map((r) => [r.user_id, accessFrom(r)]));
}

/** One active member's access, or null when they aren't in the business. */
export async function memberAccess(db: Queryable, workspaceId: string, userId: string): Promise<PersonAccess | null> {
  return (await loadAccess(db, workspaceId, [userId])).get(userId) ?? null;
}
