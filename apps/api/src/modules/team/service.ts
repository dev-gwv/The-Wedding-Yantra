import {
  AREA_INFO,
  areaGives,
  areaNeeds,
  assignableRoles,
  beyond,
  can,
  canManageMember,
  cleanAreas,
  formatPhone,
  maskPhone,
  resolveAccess,
  ROLE_INFO,
  startingAreas,
  type Area,
  type Permission,
  type Role,
} from "@wedding-yantra/core";
import type {
  AcceptedInvitation,
  CreatedInvitation,
  DepartmentAccess,
  Employee,
  EmployeeDetailsInput,
  EmploymentType,
  FormerMember,
  Invitation,
  InvitationPreview,
  InvitationStatus,
  Member,
  PayType,
  Team,
} from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { randomToken, sha256 } from "../../lib/crypto.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { AuthContext, MemberContext } from "../auth/guard.js";
import { accessFrom, type AccessRow } from "../auth/access.js";
import { assertOption, optionJoin } from "../options/service.js";

const INVITE_TTL_DAYS = 7;

interface InvitationRow {
  id: string;
  name: string;
  phone: string;
  role: Role;
  department: string | null;
  department_label: string | null;
  invited_by_name: string | null;
  created_at: Date;
  expires_at: Date;
}

const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  role: r.role,
  department: r.department,
  departmentLabel: r.department_label ?? r.department,
  invitedByName: r.invited_by_name,
  createdAt: r.created_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
});

const INVITATION_SELECT = `
  SELECT i.id, i.name, i.phone, i.role, i.department, dpt.label AS department_label, u.name AS invited_by_name, i.created_at, i.expires_at
    FROM invitations i
    LEFT JOIN users u ON u.id = i.invited_by
    ${optionJoin("dpt", "department", "i.workspace_id", "i.department")}`;

interface MemberRow extends AccessRow {
  id: string;
  user_id: string;
  name: string | null;
  phone: string;
  role: Role;
  created_at: Date;
  removed_at: Date | null;
  designation: string | null;
  designation_label: string | null;
  department: string | null;
  department_label: string | null;
  employment_type: EmploymentType | null;
}

const MEMBER_SELECT = `
  SELECT m.id, m.user_id, u.name, u.phone, m.role, m.created_at, m.removed_at,
         d.designation, dl.label AS designation_label, d.department, dp.label AS department_label, d.employment_type,
         coalesce(d.department_on, false) AS department_on, da.areas AS department_areas, m.extra_areas
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN member_details d ON d.membership_id = m.id
    LEFT JOIN department_access da ON da.workspace_id = m.workspace_id AND da.department = d.department
    ${optionJoin("dl", "designation", "m.workspace_id", "d.designation")}
    ${optionJoin("dp", "department", "m.workspace_id", "d.department")}`;

const toMember = (r: MemberRow, ctx: MemberContext): Member => {
  const access = accessFrom(r);
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    phone: r.phone,
    role: r.role,
    joinedAt: r.created_at.toISOString(),
    isYou: r.user_id === ctx.userId,
    designation: r.designation,
    designationLabel: r.designation_label ?? r.designation,
    department: r.department,
    departmentLabel: r.department_label ?? r.department,
    departmentOn: r.department_on,
    employmentType: r.employment_type,
    permissions: access.permissions,
    areas: access.areas,
    accessSource: access.source,
    departmentAreas: access.departmentAreas,
    extraAreas: access.extraAreas,
    savedExtraAreas: cleanAreas(r.extra_areas),
  };
};

/** Names of screens, for the activity log: "Leads & follow-ups, Quotes & prices". */
const areaNames = (areas: readonly Area[]) => areas.map((a) => AREA_INFO[a].label).join(", ");

export async function getTeam(db: Db, ctx: MemberContext): Promise<Team> {
  if (!can(ctx, "members.view")) throw forbidden("You can't see the team list");

  const members = await db.query<MemberRow>(
    `${MEMBER_SELECT}
      WHERE m.workspace_id = $1 AND m.removed_at IS NULL
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name NULLS LAST`,
    [ctx.workspaceId],
  );

  let invitations: Invitation[] = [];
  if (can(ctx, "members.invite")) {
    const { rows } = await db.query<InvitationRow>(
      `${INVITATION_SELECT}
        WHERE i.workspace_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
        ORDER BY i.created_at DESC`,
      [ctx.workspaceId],
    );
    invitations = rows.map(toInvitation);
  }

  // Everyone who has left and not come back, once each (their latest time in the team).
  let former: FormerMember[] = [];
  if (can(ctx, "members.manage")) {
    const { rows } = await db.query<MemberRow>(
      `SELECT * FROM (
         SELECT DISTINCT ON (x.user_id) x.* FROM (${MEMBER_SELECT} WHERE m.workspace_id = $1 AND m.removed_at IS NOT NULL) x
          WHERE NOT EXISTS (SELECT 1 FROM memberships a WHERE a.workspace_id = $1 AND a.user_id = x.user_id AND a.removed_at IS NULL)
          ORDER BY x.user_id, x.removed_at DESC
       ) f ORDER BY f.removed_at DESC`,
      [ctx.workspaceId],
    );
    former = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      phone: r.phone,
      role: r.role,
      designationLabel: r.designation_label ?? r.designation,
      leftAt: r.removed_at!.toISOString(),
    }));
  }

  return { members: members.rows.map((r) => toMember(r, ctx)), invitations, former };
}

// ---------------------------------------------------------------------------
// The employee master: one person's work details, emergency contact, pay and bank.
// ---------------------------------------------------------------------------

interface DetailsRow {
  joined_on: string | null;
  emergency_name: string | null;
  emergency_phone: string | null;
  pay_type: PayType | null;
  pay_amount: string | null;
  upi_id: string | null;
  bank_account: string | null;
  ifsc: string | null;
  pan: string | null;
}

/**
 * Anyone who can see the team sees the work details. The emergency contact is for the
 * owner, managers and the person themselves; pay, bank and PAN for the owner and the
 * person themselves. Someone who has left is seen by those who manage the team.
 */
export async function getEmployee(db: Queryable, ctx: MemberContext, memberId: string): Promise<Employee> {
  const { rows } = await db.query<MemberRow & DetailsRow>(
    `SELECT x.*, d.joined_on::text AS joined_on, d.emergency_name, d.emergency_phone, d.pay_type, d.pay_amount,
            d.upi_id, d.bank_account, d.ifsc, d.pan
       FROM (${MEMBER_SELECT} WHERE m.id = $1 AND m.workspace_id = $2) x
       LEFT JOIN member_details d ON d.membership_id = x.id`,
    [memberId, ctx.workspaceId],
  );
  const r = rows[0];
  if (!r) throw notFound("This team member");
  const self = r.user_id === ctx.userId && r.removed_at === null;
  const allowed = self || (r.removed_at === null ? can(ctx, "members.view") : can(ctx, "members.manage"));
  if (!allowed) throw notFound("This team member");

  return {
    ...toMember(r, ctx),
    isYou: self,
    leftAt: r.removed_at?.toISOString() ?? null,
    joinedOn: r.joined_on,
    emergency: self || can(ctx, "members.manage") ? { name: r.emergency_name, phone: r.emergency_phone } : null,
    pay:
      self || can(ctx, "members.hr")
        ? {
            payType: r.pay_type,
            payAmount: r.pay_amount === null ? null : Number(r.pay_amount),
            upiId: r.upi_id,
            bankAccount: r.bank_account,
            ifsc: r.ifsc,
            pan: r.pan,
          }
        : null,
  };
}

type DetailsInput = { [K in keyof EmployeeDetailsInput]?: EmployeeDetailsInput[K] | null };

const DETAIL_COLUMNS: [keyof DetailsInput, string][] = [
  ["designation", "designation"],
  ["department", "department"],
  ["employmentType", "employment_type"],
  ["joinedOn", "joined_on"],
  ["emergencyName", "emergency_name"],
  ["emergencyPhone", "emergency_phone"],
  ["payType", "pay_type"],
  ["payAmount", "pay_amount"],
  ["upiId", "upi_id"],
  ["bankAccount", "bank_account"],
  ["ifsc", "ifsc"],
  ["pan", "pan"],
];

/** Only the owner changes employee details. Fields left out keep what they had. */
export async function updateEmployeeDetails(db: Db, ctx: MemberContext, memberId: string, input: DetailsInput): Promise<Employee> {
  if (!can(ctx, "members.hr")) throw forbidden("Only the owner can change employee details");
  const { rows } = await db.query<{ name: string | null; designation: string | null; department: string | null }>(
    `SELECT u.name, d.designation, d.department FROM memberships m JOIN users u ON u.id = m.user_id
       LEFT JOIN member_details d ON d.membership_id = m.id
      WHERE m.id = $1 AND m.workspace_id = $2`,
    [memberId, ctx.workspaceId],
  );
  const was = rows[0];
  if (!was) throw notFound("This team member");
  if (input.designation) await assertOption(db, ctx.workspaceId, "designation", input.designation, "designation", was.designation);
  if (input.department) await assertOption(db, ctx.workspaceId, "department", input.department, "department", was.department);

  const cols = DETAIL_COLUMNS.filter(([key]) => input[key] !== undefined);
  if (cols.length) {
    // Choosing a department turns its screens on.
    const departmentChanged = input.department !== undefined && input.department !== was.department;
    const extra = departmentChanged ? [["department_on", input.department !== null] as const] : [];
    const all = [...cols.map(([key, c]) => [c, input[key]] as const), ...extra];
    await db.query(
      `INSERT INTO member_details (membership_id, workspace_id${all.map(([c]) => `, ${c}`).join("")})
       VALUES ($1, $2${all.map((_, i) => `, $${i + 3}`).join("")})
       ON CONFLICT (membership_id) DO UPDATE SET ${all.map(([c]) => `${c} = EXCLUDED.${c}`).join(", ")}`,
      [memberId, ctx.workspaceId, ...all.map(([, v]) => v)],
    );
    await logActivity(db, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "member.details_updated",
      entityType: "membership",
      entityId: memberId,
      meta: { name: was.name, ...(departmentChanged ? { department: { from: was.department, to: input.department } } : {}) },
    });
  }
  return getEmployee(db, ctx, memberId);
}

// ---------------------------------------------------------------------------
// Access: which screens each department gets, and each person's department and extras.
// Only the owner changes these: they decide what everyone can see.
// ---------------------------------------------------------------------------

const requireOwner = (ctx: MemberContext) => {
  if (!can(ctx, "members.hr")) throw forbidden("Only the owner decides who sees which screens");
};

async function departmentLabel(db: Queryable, workspaceId: string, key: string): Promise<string> {
  const { rows } = await db.query<{ label: string }>(
    `SELECT label FROM custom_options WHERE workspace_id = $1 AND list = 'department' AND key = $2`,
    [workspaceId, key],
  );
  if (!rows[0]) throw notFound("This department");
  return rows[0].label;
}

/** Every department's screens: what the owner chose, or its starting screens. Hidden ones too. */
export async function listDepartmentAccess(db: Queryable, ctx: MemberContext): Promise<DepartmentAccess[]> {
  if (!can(ctx, "members.view")) throw forbidden("You can't see the departments");
  const { rows } = await db.query<{ key: string; areas: string[] | null }>(
    `SELECT o.key, da.areas FROM custom_options o
       LEFT JOIN department_access da ON da.workspace_id = o.workspace_id AND da.department = o.key
      WHERE o.workspace_id = $1 AND o.list = 'department'
      ORDER BY o.position, o.created_at`,
    [ctx.workspaceId],
  );
  return rows.map((r) => ({
    department: r.key,
    areas: r.areas ? cleanAreas(r.areas) : startingAreas(r.key),
    isDefault: r.areas === null,
  }));
}

async function departmentAccess(db: Queryable, workspaceId: string, key: string): Promise<{ areas: Area[]; isDefault: boolean }> {
  const { rows } = await db.query<{ areas: string[] }>(`SELECT areas FROM department_access WHERE workspace_id = $1 AND department = $2`, [workspaceId, key]);
  return rows[0] ? { areas: cleanAreas(rows[0].areas), isDefault: false } : { areas: startingAreas(key), isDefault: true };
}

const changeSummary = (from: readonly Area[], to: readonly Area[]) => {
  const added = to.filter((a) => !from.includes(a));
  const removed = from.filter((a) => !to.includes(a));
  return [added.length ? `added ${areaNames(added)}` : "", removed.length ? `took away ${areaNames(removed)}` : ""].filter(Boolean).join("; ");
};

/** The owner chooses a department's screens. `null` puts back its starting screens. */
export async function setDepartmentAccess(db: Db, ctx: MemberContext, key: string, areas: Area[] | null): Promise<DepartmentAccess> {
  requireOwner(ctx);
  const label = await departmentLabel(db, ctx.workspaceId, key);
  const before = await departmentAccess(db, ctx.workspaceId, key);
  if (areas === null) {
    await db.query(`DELETE FROM department_access WHERE workspace_id = $1 AND department = $2`, [ctx.workspaceId, key]);
  } else {
    await db.query(
      `INSERT INTO department_access (workspace_id, department, areas, updated_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, department) DO UPDATE SET areas = EXCLUDED.areas, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [ctx.workspaceId, key, cleanAreas(areas), ctx.userId],
    );
  }
  const after = await departmentAccess(db, ctx.workspaceId, key);
  const summary = changeSummary(before.areas, after.areas);
  if (summary || areas === null) {
    await logActivity(db, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "department.screens_changed",
      entityType: "department",
      entityId: null,
      meta: { key, label, summary: areas === null ? `back to its starting screens${summary ? ` (${summary})` : ""}` : summary },
    });
  }
  return { department: key, ...after };
}

interface TargetAccessRow extends AccessRow {
  id: string;
  user_id: string;
  name: string | null;
}

async function loadTargetAccess(db: Queryable, workspaceId: string, memberId: string): Promise<TargetAccessRow> {
  const { rows } = await db.query<TargetAccessRow>(
    `SELECT m.id, m.user_id, u.name, m.role, d.department, coalesce(d.department_on, false) AS department_on,
            da.areas AS department_areas, m.extra_areas, dp.label AS department_label
       FROM memberships m JOIN users u ON u.id = m.user_id
       LEFT JOIN member_details d ON d.membership_id = m.id
       LEFT JOIN department_access da ON da.workspace_id = m.workspace_id AND da.department = d.department
       ${optionJoin("dp", "department", "m.workspace_id", "d.department")}
      WHERE m.id = $1 AND m.workspace_id = $2 AND m.removed_at IS NULL`,
    [memberId, workspaceId],
  );
  if (!rows[0]) throw notFound("This team member");
  return rows[0];
}

/**
 * The owner puts someone in a department (its screens turn on) and switches extra screens
 * on or off for them. Fields left out keep what they had.
 */
export async function setMemberAccess(
  db: Db,
  ctx: MemberContext,
  memberId: string,
  input: { department?: string | null; extraAreas?: Area[] },
): Promise<Employee> {
  requireOwner(ctx);
  const target = await loadTargetAccess(db, ctx.workspaceId, memberId);
  const before = accessFrom(target);
  if (input.department) await assertOption(db, ctx.workspaceId, "department", input.department, "department", target.department);
  let extras: Area[] | undefined;
  if (input.extraAreas !== undefined) {
    extras = cleanAreas(input.extraAreas);
    if (extras.length && (target.role === "owner" || target.role === "freelancer")) {
      const message = target.role === "owner" ? "The owner already sees everything" : "Freelancers see only the events they're booked on. Make them Staff to give them screens.";
      throw new AppError(400, "VALIDATION_ERROR", message, { extraAreas: message });
    }
    // Screens saved earlier stay saved (they come back if the role goes back up); new ones must be usable.
    const saved = cleanAreas(target.extra_areas);
    const useless = extras.find((a) => !saved.includes(a) && areaGives(target.role, a).length === 0);
    if (useless) {
      const message = `${AREA_INFO[useless].label} needs the ${ROLE_INFO[areaNeeds(useless)].label} role`;
      throw new AppError(400, "VALIDATION_ERROR", message, { extraAreas: message });
    }
  }

  await withTransaction(db, async (tx) => {
    if (input.department !== undefined) {
      await tx.query(
        `INSERT INTO member_details (membership_id, workspace_id, department, department_on) VALUES ($1, $2, $3, $4)
         ON CONFLICT (membership_id) DO UPDATE SET department = EXCLUDED.department, department_on = EXCLUDED.department_on`,
        [memberId, ctx.workspaceId, input.department, input.department !== null],
      );
    }
    if (extras !== undefined) await tx.query(`UPDATE memberships SET extra_areas = $2 WHERE id = $1`, [memberId, extras]);
    const after = accessFrom(await loadTargetAccess(tx, ctx.workspaceId, memberId));
    const parts = [
      input.department !== undefined && input.department !== target.department
        ? input.department
          ? `put in ${after.departmentLabel ?? input.department}`
          : "taken out of their department"
        : "",
      changeSummary(before.areas, after.areas),
    ].filter(Boolean);
    if (parts.length) {
      await logActivity(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "member.screens_changed",
        entityType: "membership",
        entityId: memberId,
        meta: {
          name: target.name,
          summary: parts.join("; "),
          department: { from: target.department, to: input.department === undefined ? target.department : input.department },
          areas: { from: before.areas, to: after.areas },
        },
      });
    }
  });
  return getEmployee(db, ctx, memberId);
}

/**
 * People placed in a department before departments decided screens kept their role's usual
 * access. The owner turns their department's screens on here.
 */
export async function applyDepartments(db: Db, ctx: MemberContext, memberIds: string[]): Promise<{ applied: number }> {
  requireOwner(ctx);
  let applied = 0;
  await withTransaction(db, async (tx) => {
    const { rows: targets } = await tx.query<TargetAccessRow>(
      `SELECT m.id, m.user_id, u.name, m.role, d.department, coalesce(d.department_on, false) AS department_on,
              da.areas AS department_areas, m.extra_areas, dp.label AS department_label
         FROM memberships m JOIN users u ON u.id = m.user_id
         LEFT JOIN member_details d ON d.membership_id = m.id
         LEFT JOIN department_access da ON da.workspace_id = m.workspace_id AND da.department = d.department
         ${optionJoin("dp", "department", "m.workspace_id", "d.department")}
        WHERE m.id = ANY($1::uuid[]) AND m.workspace_id = $2 AND m.removed_at IS NULL`,
      [memberIds, ctx.workspaceId],
    );
    for (const target of targets) {
      const id = target.id;
      if (!target.department || target.department_on) continue;
      const before = accessFrom(target);
      await tx.query(`UPDATE member_details SET department_on = true WHERE membership_id = $1`, [id]);
      const after = accessFrom({ ...target, department_on: true });
      applied += 1;
      await logActivity(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "member.screens_changed",
        entityType: "membership",
        entityId: id,
        meta: {
          name: target.name,
          summary: [`turned on ${target.department_label ?? target.department}'s screens`, changeSummary(before.areas, after.areas)].filter(Boolean).join("; "),
          areas: { from: before.areas, to: after.areas },
        },
      });
    }
  });
  return { applied };
}

/** What someone would have with a role, from their department and extras. */
const accessWithRole = (row: AccessRow, role: Role) => resolveAccess({
  role,
  department: row.department,
  departmentOn: row.department_on,
  departmentAreas: row.department_areas,
  extraAreas: row.extra_areas,
});

/** "You can't give more than you have": the owner can give anything; anyone else only what they hold. */
function assertWithin(ctx: MemberContext, gained: readonly Permission[]) {
  if (ctx.role === "owner") return;
  const missing = beyond(ctx, gained);
  if (missing.length) {
    throw new AppError(403, "FORBIDDEN", "That would give access you don't have yourself. Ask the owner.", {
      role: "That would give access you don't have yourself. Ask the owner.",
    });
  }
}

export async function inviteMember(
  db: Db,
  ctx: MemberContext,
  input: { name: string; phone: string; role: Role; department?: string | null },
): Promise<CreatedInvitation> {
  if (!can(ctx, "members.invite")) throw forbidden("Only the owner or a manager can invite people");
  if (!assignableRoles(ctx.role).includes(input.role)) {
    throw new AppError(403, "FORBIDDEN", "You can't give this role", { role: "You can't give this role" });
  }
  if (input.department && !can(ctx, "members.hr")) throw forbidden("Only the owner chooses a department");

  return withTransaction(db, async (tx) => {
    const existing = await tx.query(
      `SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = $1 AND u.phone = $2 AND m.removed_at IS NULL`,
      [ctx.workspaceId, input.phone],
    );
    if (existing.rowCount) {
      const message = `${formatPhone(input.phone)} is already in your team`;
      throw new AppError(409, "ALREADY_MEMBER", message, { phone: message });
    }

    // Inviting the same number again replaces the earlier link, keeping its department unless the owner chose again.
    const replaced = await tx.query<{ department: string | null }>(
      `UPDATE invitations SET revoked_at = now()
        WHERE workspace_id = $1 AND phone = $2 AND accepted_at IS NULL AND revoked_at IS NULL
        RETURNING department`,
      [ctx.workspaceId, input.phone],
    );
    const kept = replaced.rows[0]?.department ?? null;
    const department = input.department !== undefined && can(ctx, "members.hr") ? input.department : kept;
    // Keeping the department a re-sent invite already had is fine even if it's hidden now.
    if (department) await assertOption(tx, ctx.workspaceId, "department", department, "department", kept);

    // What they'll be able to do when they join, which can't be more than the person inviting them has.
    if (ctx.role !== "owner") {
      const areas = department ? (await departmentAccess(tx, ctx.workspaceId, department)).areas : null;
      const joining = resolveAccess({ role: input.role, department, departmentOn: department !== null, departmentAreas: areas, extraAreas: [] });
      assertWithin(ctx, joining.permissions);
    }

    const token = randomToken();
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO invitations (workspace_id, name, phone, role, department, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(days => $8))
       RETURNING id`,
      [ctx.workspaceId, input.name, input.phone, input.role, department, sha256(token), ctx.userId, INVITE_TTL_DAYS],
    );
    const id = rows[0]!.id;
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "member.invited",
      entityType: "invitation",
      entityId: id,
      meta: { role: input.role, department },
    });
    const created = await tx.query<InvitationRow>(`${INVITATION_SELECT} WHERE i.id = $1`, [id]);
    return { invitation: toInvitation(created.rows[0]!), token };
  });
}

export async function revokeInvitation(db: Db, ctx: MemberContext, invitationId: string): Promise<void> {
  if (!can(ctx, "members.invite")) throw forbidden();
  const { rowCount } = await db.query(
    `UPDATE invitations SET revoked_at = now()
      WHERE id = $1 AND workspace_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
    [invitationId, ctx.workspaceId],
  );
  if (!rowCount) throw notFound("This invitation");
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "member.invite_revoked",
    entityType: "invitation",
    entityId: invitationId,
  });
}

async function loadTarget(db: Db, ctx: MemberContext, memberId: string) {
  const { rows } = await db.query<{ id: string; user_id: string; role: Role }>(
    `SELECT id, user_id, role FROM memberships WHERE id = $1 AND workspace_id = $2 AND removed_at IS NULL`,
    [memberId, ctx.workspaceId],
  );
  const target = rows[0];
  if (!target) throw notFound("This team member");
  if (target.user_id === ctx.userId) throw forbidden("You can't change your own role");
  if (!can(ctx, "members.manage") || !canManageMember(ctx.role, target.role)) throw forbidden();
  return target;
}

export async function updateMemberRole(db: Db, ctx: MemberContext, memberId: string, role: Role): Promise<void> {
  const target = await loadTarget(db, ctx, memberId);
  if (!assignableRoles(ctx.role).includes(role)) {
    throw new AppError(403, "FORBIDDEN", "You can't give this role", { role: "You can't give this role" });
  }
  // Their department's screens follow the new role, so what they'd gain can't be more than the changer has.
  const row = await loadTargetAccess(db, ctx.workspaceId, target.id);
  const before = accessFrom(row);
  const after = accessWithRole(row, role);
  assertWithin(
    ctx,
    after.permissions.filter((p) => !before.permissions.includes(p)),
  );
  await db.query(`UPDATE memberships SET role = $2 WHERE id = $1`, [target.id, role]);
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "member.role_changed",
    entityType: "membership",
    entityId: target.id,
    meta: { from: target.role, to: role, areas: { from: before.areas, to: after.areas } },
  });
}

export async function removeMember(db: Db, ctx: MemberContext, memberId: string): Promise<void> {
  const target = await loadTarget(db, ctx, memberId);
  await db.query(`UPDATE memberships SET removed_at = now() WHERE id = $1`, [target.id]);
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "member.removed",
    entityType: "membership",
    entityId: target.id,
  });
}

interface PreviewRow {
  id: string;
  workspace_id: string;
  workspace_name: string;
  business_type_name: string;
  invited_by_name: string | null;
  name: string;
  phone: string;
  role: Role;
  department: string | null;
  accepted_at: Date | null;
  revoked_at: Date | null;
  expired: boolean;
}

async function loadInvitationByToken(db: Db, token: string): Promise<PreviewRow> {
  const { rows } = await db.query<PreviewRow>(
    `SELECT i.id, i.workspace_id, w.name AS workspace_name, bt.name AS business_type_name,
            u.name AS invited_by_name, i.name, i.phone, i.role, i.department, i.accepted_at, i.revoked_at,
            i.expires_at < now() AS expired
       FROM invitations i
       JOIN workspaces w ON w.id = i.workspace_id AND w.deleted_at IS NULL
       JOIN business_types bt ON bt.id = w.business_type_id
       LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.token_hash = $1`,
    [sha256(token)],
  );
  if (!rows[0]) throw notFound("This invitation");
  return rows[0];
}

const statusOf = (r: PreviewRow): InvitationStatus =>
  r.accepted_at ? "accepted" : r.revoked_at ? "revoked" : r.expired ? "expired" : "pending";

export async function previewInvitation(db: Db, token: string): Promise<InvitationPreview> {
  const r = await loadInvitationByToken(db, token);
  return {
    workspaceName: r.workspace_name,
    businessTypeName: r.business_type_name,
    invitedByName: r.invited_by_name,
    inviteeName: r.name,
    role: r.role,
    phoneMasked: maskPhone(r.phone),
    status: statusOf(r),
  };
}

export async function acceptInvitation(db: Db, auth: AuthContext, token: string): Promise<AcceptedInvitation> {
  const invite = await loadInvitationByToken(db, token);
  const status = statusOf(invite);
  if (status !== "pending") {
    const message =
      status === "accepted"
        ? "This invitation was already used"
        : status === "expired"
          ? "This invitation has expired. Ask for a new link."
          : "This invitation was cancelled";
    throw new AppError(410, "INVITATION_UNAVAILABLE", message);
  }

  return withTransaction(db, async (tx) => {
    const user = await tx.query<{ phone: string; name: string | null }>(
      `SELECT phone, name FROM users WHERE id = $1`,
      [auth.userId],
    );
    if (user.rows[0]?.phone !== invite.phone) {
      throw forbidden(`This invitation was sent to ${maskPhone(invite.phone)}. Sign in with that number to join.`);
    }

    const claimed = await tx.query(
      `UPDATE invitations SET accepted_at = now(), accepted_by = $2
        WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [invite.id, auth.userId],
    );
    if (claimed.rowCount !== 1) throw new AppError(410, "INVITATION_UNAVAILABLE", "This invitation was already used");

    const joined = await tx.query<{ id: string }>(
      `INSERT INTO memberships (workspace_id, user_id, role)
       SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL)
       RETURNING id`,
      [invite.workspace_id, auth.userId, invite.role],
    );
    // Someone coming back keeps the details they had last time. Their old department's
    // screens stay off until the owner turns them on, unless the invitation names a department.
    if (joined.rows[0]) {
      await tx.query(
        `INSERT INTO member_details (membership_id, workspace_id, designation, department, department_on, employment_type, joined_on, emergency_name,
                                     emergency_phone, pay_type, pay_amount, upi_id, bank_account, ifsc, pan)
         SELECT $3, d.workspace_id, d.designation, d.department, false, d.employment_type, d.joined_on, d.emergency_name,
                d.emergency_phone, d.pay_type, d.pay_amount, d.upi_id, d.bank_account, d.ifsc, d.pan
           FROM member_details d JOIN memberships m ON m.id = d.membership_id
          WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.removed_at IS NOT NULL
          ORDER BY m.removed_at DESC LIMIT 1`,
        [invite.workspace_id, auth.userId, joined.rows[0].id],
      );
      if (invite.department) {
        await tx.query(
          `INSERT INTO member_details (membership_id, workspace_id, department, department_on) VALUES ($1, $2, $3, true)
           ON CONFLICT (membership_id) DO UPDATE SET department = EXCLUDED.department, department_on = true`,
          [joined.rows[0].id, invite.workspace_id, invite.department],
        );
      }
    }
    if (!user.rows[0].name) {
      await tx.query(`UPDATE users SET name = $2 WHERE id = $1`, [auth.userId, invite.name]);
    }
    await logActivity(tx, {
      workspaceId: invite.workspace_id,
      actorUserId: auth.userId,
      action: "member.joined",
      entityType: "invitation",
      entityId: invite.id,
      meta: { role: invite.role },
    });
    return { workspaceId: invite.workspace_id };
  });
}
