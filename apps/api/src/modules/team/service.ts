import { assignableRoles, can, canManageMember, formatPhone, maskPhone, type Role } from "@wedding-yantra/core";
import type {
  AcceptedInvitation,
  CreatedInvitation,
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
import { assertOption, optionJoin } from "../options/service.js";

const INVITE_TTL_DAYS = 7;

interface InvitationRow {
  id: string;
  name: string;
  phone: string;
  role: Role;
  invited_by_name: string | null;
  created_at: Date;
  expires_at: Date;
}

const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  role: r.role,
  invitedByName: r.invited_by_name,
  createdAt: r.created_at.toISOString(),
  expiresAt: r.expires_at.toISOString(),
});

const INVITATION_SELECT = `
  SELECT i.id, i.name, i.phone, i.role, u.name AS invited_by_name, i.created_at, i.expires_at
    FROM invitations i
    LEFT JOIN users u ON u.id = i.invited_by`;

interface MemberRow {
  id: string;
  user_id: string;
  name: string | null;
  phone: string;
  role: Role;
  created_at: Date;
  removed_at: Date | null;
  designation: string | null;
  designation_label: string | null;
  employment_type: EmploymentType | null;
}

const MEMBER_SELECT = `
  SELECT m.id, m.user_id, u.name, u.phone, m.role, m.created_at, m.removed_at,
         d.designation, dl.label AS designation_label, d.employment_type
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN member_details d ON d.membership_id = m.id
    ${optionJoin("dl", "designation", "m.workspace_id", "d.designation")}`;

const toMember = (r: MemberRow, ctx: MemberContext): Member => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  phone: r.phone,
  role: r.role,
  joinedAt: r.created_at.toISOString(),
  isYou: r.user_id === ctx.userId,
  designation: r.designation,
  designationLabel: r.designation_label ?? r.designation,
  employmentType: r.employment_type,
});

export async function getTeam(db: Db, ctx: MemberContext): Promise<Team> {
  if (!can(ctx.role, "members.view")) throw forbidden("You can't see the team list");

  const members = await db.query<MemberRow>(
    `${MEMBER_SELECT}
      WHERE m.workspace_id = $1 AND m.removed_at IS NULL
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.name NULLS LAST`,
    [ctx.workspaceId],
  );

  let invitations: Invitation[] = [];
  if (can(ctx.role, "members.invite")) {
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
  if (can(ctx.role, "members.manage")) {
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
  const allowed = self || (r.removed_at === null ? can(ctx.role, "members.view") : can(ctx.role, "members.manage"));
  if (!allowed) throw notFound("This team member");

  return {
    ...toMember(r, ctx),
    isYou: self,
    leftAt: r.removed_at?.toISOString() ?? null,
    joinedOn: r.joined_on,
    emergency: self || can(ctx.role, "members.manage") ? { name: r.emergency_name, phone: r.emergency_phone } : null,
    pay:
      self || can(ctx.role, "members.hr")
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
  if (!can(ctx.role, "members.hr")) throw forbidden("Only the owner can change employee details");
  const { rows } = await db.query<{ name: string | null; designation: string | null }>(
    `SELECT u.name, d.designation FROM memberships m JOIN users u ON u.id = m.user_id
       LEFT JOIN member_details d ON d.membership_id = m.id
      WHERE m.id = $1 AND m.workspace_id = $2`,
    [memberId, ctx.workspaceId],
  );
  const was = rows[0];
  if (!was) throw notFound("This team member");
  if (input.designation) await assertOption(db, ctx.workspaceId, "designation", input.designation, "designation", was.designation);

  const cols = DETAIL_COLUMNS.filter(([key]) => input[key] !== undefined);
  if (cols.length) {
    await db.query(
      `INSERT INTO member_details (membership_id, workspace_id${cols.map(([, c]) => `, ${c}`).join("")})
       VALUES ($1, $2${cols.map((_, i) => `, $${i + 3}`).join("")})
       ON CONFLICT (membership_id) DO UPDATE SET ${cols.map(([, c]) => `${c} = EXCLUDED.${c}`).join(", ")}`,
      [memberId, ctx.workspaceId, ...cols.map(([key]) => input[key])],
    );
    await logActivity(db, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "member.details_updated",
      entityType: "membership",
      entityId: memberId,
      meta: { name: was.name },
    });
  }
  return getEmployee(db, ctx, memberId);
}

export async function inviteMember(
  db: Db,
  ctx: MemberContext,
  input: { name: string; phone: string; role: Role },
): Promise<CreatedInvitation> {
  if (!can(ctx.role, "members.invite")) throw forbidden("Only the owner or a manager can invite people");
  if (!assignableRoles(ctx.role).includes(input.role)) {
    throw new AppError(403, "FORBIDDEN", "You can't give this role", { role: "You can't give this role" });
  }

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

    // Inviting the same number again replaces the earlier link.
    await tx.query(
      `UPDATE invitations SET revoked_at = now()
        WHERE workspace_id = $1 AND phone = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [ctx.workspaceId, input.phone],
    );

    const token = randomToken();
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO invitations (workspace_id, name, phone, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(days => $7))
       RETURNING id`,
      [ctx.workspaceId, input.name, input.phone, input.role, sha256(token), ctx.userId, INVITE_TTL_DAYS],
    );
    const id = rows[0]!.id;
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "member.invited",
      entityType: "invitation",
      entityId: id,
      meta: { role: input.role },
    });
    const created = await tx.query<InvitationRow>(`${INVITATION_SELECT} WHERE i.id = $1`, [id]);
    return { invitation: toInvitation(created.rows[0]!), token };
  });
}

export async function revokeInvitation(db: Db, ctx: MemberContext, invitationId: string): Promise<void> {
  if (!can(ctx.role, "members.invite")) throw forbidden();
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
  if (!can(ctx.role, "members.manage") || !canManageMember(ctx.role, target.role)) throw forbidden();
  return target;
}

export async function updateMemberRole(db: Db, ctx: MemberContext, memberId: string, role: Role): Promise<void> {
  const target = await loadTarget(db, ctx, memberId);
  if (!assignableRoles(ctx.role).includes(role)) {
    throw new AppError(403, "FORBIDDEN", "You can't give this role", { role: "You can't give this role" });
  }
  await db.query(`UPDATE memberships SET role = $2 WHERE id = $1`, [target.id, role]);
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "member.role_changed",
    entityType: "membership",
    entityId: target.id,
    meta: { from: target.role, to: role },
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
  accepted_at: Date | null;
  revoked_at: Date | null;
  expired: boolean;
}

async function loadInvitationByToken(db: Db, token: string): Promise<PreviewRow> {
  const { rows } = await db.query<PreviewRow>(
    `SELECT i.id, i.workspace_id, w.name AS workspace_name, bt.name AS business_type_name,
            u.name AS invited_by_name, i.name, i.phone, i.role, i.accepted_at, i.revoked_at,
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
    // Someone coming back keeps the details they had last time.
    if (joined.rows[0]) {
      await tx.query(
        `INSERT INTO member_details (membership_id, workspace_id, designation, employment_type, joined_on, emergency_name,
                                     emergency_phone, pay_type, pay_amount, upi_id, bank_account, ifsc, pan)
         SELECT $3, d.workspace_id, d.designation, d.employment_type, d.joined_on, d.emergency_name,
                d.emergency_phone, d.pay_type, d.pay_amount, d.upi_id, d.bank_account, d.ifsc, d.pan
           FROM member_details d JOIN memberships m ON m.id = d.membership_id
          WHERE m.workspace_id = $1 AND m.user_id = $2 AND m.removed_at IS NOT NULL
          ORDER BY m.removed_at DESC LIMIT 1`,
        [invite.workspace_id, auth.userId, joined.rows[0].id],
      );
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
