import { assignableRoles, can, canManageMember, formatPhone, maskPhone, type Role } from "@wedding-yantra/core";
import type {
  AcceptedInvitation,
  CreatedInvitation,
  Invitation,
  InvitationPreview,
  InvitationStatus,
  Member,
  Team,
} from "@wedding-yantra/types";
import { withTransaction, type Db } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { randomToken, sha256 } from "../../lib/crypto.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { AuthContext, MemberContext } from "../auth/guard.js";

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

export async function getTeam(db: Db, ctx: MemberContext): Promise<Team> {
  if (!can(ctx.role, "members.view")) throw forbidden("You can't see the team list");

  const members = await db.query<{
    id: string;
    user_id: string;
    name: string | null;
    phone: string;
    role: Role;
    created_at: Date;
  }>(
    `SELECT m.id, m.user_id, u.name, u.phone, m.role, m.created_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
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

  return {
    members: members.rows.map(
      (r): Member => ({
        id: r.id,
        userId: r.user_id,
        name: r.name,
        phone: r.phone,
        role: r.role,
        joinedAt: r.created_at.toISOString(),
        isYou: r.user_id === ctx.userId,
      }),
    ),
    invitations,
  };
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

    await tx.query(
      `INSERT INTO memberships (workspace_id, user_id, role)
       SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $2 AND removed_at IS NULL)`,
      [invite.workspace_id, auth.userId, invite.role],
    );
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
