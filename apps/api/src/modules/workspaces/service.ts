import { eventScope, type Role } from "@wedding-yantra/core";
import type { HomeSummary, StarterPack, UpdateWorkspaceInput, Workspace } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { installSalesDefaults } from "../sales/defaults.js";
import { salesSummary } from "../sales/leads.js";
import { listEvents } from "../bookings/events.js";
import { homeMoney } from "../money/dues.js";
import { homeTasks, installChecklist } from "../tasks/service.js";
import { homeDeliverables } from "../deliverables/service.js";
import { homeBilling } from "../billing/service.js";
import type { Config } from "../../config.js";
import { logoPath } from "../files/logo.js";

interface WorkspaceRow {
  id: string;
  name: string;
  business_type_id: string;
  business_type_name: string;
  business_type_icon: string;
  city: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  quote_terms: string | null;
  upi_id: string | null;
  bill_prefix: string;
  bill_terms: string | null;
  review_url: string | null;
  logo_file_id: string | null;
  timezone: string;
  created_at: Date;
}

const toWorkspace = (row: WorkspaceRow, role: Role): Workspace => ({
  id: row.id,
  name: row.name,
  businessTypeId: row.business_type_id,
  businessTypeName: row.business_type_name,
  businessTypeIcon: row.business_type_icon,
  city: row.city,
  phone: row.phone,
  email: row.email,
  address: row.address,
  gstin: row.gstin,
  quoteTerms: row.quote_terms,
  upiId: row.upi_id,
  billPrefix: row.bill_prefix,
  billTerms: row.bill_terms,
  reviewUrl: row.review_url,
  logoUrl: logoPath(row.id, row.logo_file_id),
  timezone: row.timezone,
  createdAt: row.created_at.toISOString(),
  role,
});

async function loadWorkspace(db: Queryable, workspaceId: string): Promise<WorkspaceRow> {
  const { rows } = await db.query<WorkspaceRow>(
    `SELECT w.id, w.name, w.business_type_id, bt.name AS business_type_name,
            bt.icon AS business_type_icon, w.city,
            w.phone, w.email, w.address, w.gstin, w.quote_terms, w.upi_id, w.bill_prefix, w.bill_terms, w.review_url, w.logo_file_id, w.timezone, w.created_at
       FROM workspaces w
       JOIN business_types bt ON bt.id = w.business_type_id
      WHERE w.id = $1 AND w.deleted_at IS NULL`,
    [workspaceId],
  );
  if (!rows[0]) throw notFound("This business");
  return rows[0];
}

export async function createWorkspace(
  db: Db,
  userId: string,
  input: { name: string; businessTypeId: string; city: string },
): Promise<Workspace> {
  return withTransaction(db, async (tx) => {
    const type = await tx.query<{ starter_pack: StarterPack }>(
      `SELECT starter_pack FROM business_types WHERE id = $1 AND active`,
      [input.businessTypeId],
    );
    if (!type.rows[0]) {
      throw new AppError(400, "VALIDATION_ERROR", "Pick what your business does", {
        businessTypeId: "Pick what your business does",
      });
    }
    // The owner's own number is a sensible default for the business phone.
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO workspaces (name, business_type_id, city, phone, created_by)
       SELECT $1, $2, $3, u.phone, u.id FROM users u WHERE u.id = $4
       RETURNING id`,
      [input.name, input.businessTypeId, input.city, userId],
    );
    const workspaceId = rows[0]!.id;
    await tx.query(`INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      workspaceId,
      userId,
    ]);
    await installSalesDefaults(tx, { id: workspaceId, name: input.name, starterPack: type.rows[0].starter_pack });
    await installChecklist(tx, workspaceId, type.rows[0].starter_pack);
    await logActivity(tx, {
      workspaceId,
      actorUserId: userId,
      action: "workspace.created",
      entityType: "workspace",
      entityId: workspaceId,
    });
    return toWorkspace(await loadWorkspace(tx, workspaceId), "owner");
  });
}

export async function getWorkspace(db: Db, workspaceId: string, role: Role): Promise<Workspace> {
  return toWorkspace(await loadWorkspace(db, workspaceId), role);
}

const COLUMNS: Record<Exclude<keyof UpdateWorkspaceInput, "logoFileId" | "pricesConfirmed">, string> = {
  name: "name",
  city: "city",
  phone: "phone",
  email: "email",
  address: "address",
  gstin: "gstin",
  quoteTerms: "quote_terms",
  upiId: "upi_id",
  billPrefix: "bill_prefix",
  billTerms: "bill_terms",
  reviewUrl: "review_url",
};

export async function updateWorkspace(
  db: Db,
  ctx: { workspaceId: string; userId: string; role: Role },
  input: Partial<Record<keyof typeof COLUMNS, string | null>> & { logoFileId?: string | null; pricesConfirmed?: true },
): Promise<Workspace> {
  const sets: string[] = [];
  const values: unknown[] = [ctx.workspaceId];
  for (const [key, column] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (input.logoFileId !== undefined) {
    if (input.logoFileId !== null) {
      const file = await db.query<{ content_type: string }>(`SELECT content_type FROM files WHERE id = $1 AND workspace_id = $2`, [
        input.logoFileId,
        ctx.workspaceId,
      ]);
      if (!file.rows[0]?.content_type.startsWith("image/")) {
        throw new AppError(400, "VALIDATION_ERROR", "Use a photo of your logo (JPG, PNG or WebP)", { logoFileId: "Use a photo of your logo" });
      }
    }
    values.push(input.logoFileId);
    sets.push(`logo_file_id = $${values.length}`);
  }
  if (input.pricesConfirmed) sets.push("prices_confirmed_at = coalesce(prices_confirmed_at, now())");
  if (sets.length > 0) {
    await db.query(`UPDATE workspaces SET ${sets.join(", ")} WHERE id = $1 AND deleted_at IS NULL`, values);
    await logActivity(db, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "workspace.updated",
      entityType: "workspace",
      entityId: ctx.workspaceId,
      meta: { fields: Object.keys(input).filter((k) => input[k as keyof typeof input] !== undefined) },
    });
  }
  return getWorkspace(db, ctx.workspaceId, ctx.role);
}

/** Everything the Home screen needs, worked out here so every app shows the same thing. */
export async function getHome(db: Db, ctx: MemberContext, config: Config): Promise<HomeSummary> {
  const workspaceId = ctx.workspaceId;
  const [base, sales, upcoming, money, tasks, deliverables, billing] = await Promise.all([
    db.query<{
      name: string;
      phone: string | null;
      address: string | null;
      business_type_name: string;
      starter_pack: StarterPack;
      members: string;
      pending_invites: string;
      prices_checked: boolean;
      has_lead: boolean;
    }>(
      `SELECT w.name, w.phone, w.address, bt.name AS business_type_name, bt.starter_pack,
              (SELECT count(*) FROM memberships m WHERE m.workspace_id = w.id AND m.removed_at IS NULL) AS members,
              (SELECT count(*) FROM invitations i
                WHERE i.workspace_id = w.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL
                  AND i.expires_at > now()) AS pending_invites,
              -- Confirmed as they are, or a price changed or a service added after setup.
              w.prices_confirmed_at IS NOT NULL
                OR EXISTS (SELECT 1 FROM catalogue_items c WHERE c.workspace_id = w.id
                            AND (c.updated_at > c.created_at OR c.created_at > w.created_at)) AS prices_checked,
              EXISTS (SELECT 1 FROM leads l WHERE l.workspace_id = w.id) AS has_lead
         FROM workspaces w
         JOIN business_types bt ON bt.id = w.business_type_id
        WHERE w.id = $1 AND w.deleted_at IS NULL`,
      [workspaceId],
    ),
    salesSummary(db, ctx),
    upcomingEvents(db, ctx),
    homeMoney(db, ctx),
    homeTasks(db, ctx),
    homeDeliverables(db, ctx),
    homeBilling(db, ctx, config),
  ]);
  const row = base.rows[0];
  if (!row) throw notFound("This business");

  const members = Number(row.members);
  const pendingInvites = Number(row.pending_invites);
  // Three steps, no more: what a new business needs before its first quote. The rest
  // (UPI, the team) is asked for where it's used.
  const setup: HomeSummary["setup"] = [
    {
      key: "business_profile",
      title: "Add your logo, phone and address",
      description: "They go on your quotes and bills, so clients know it's you.",
      done: !!row.phone && !!row.address,
    },
    {
      key: "price_list",
      title: "Check your prices",
      description: "Your usual services came ready. Change any price, or confirm they're right.",
      done: row.prices_checked,
    },
    {
      key: "first_enquiry",
      title: "Add your first enquiry",
      description: "Type one in, or share your enquiry form on Instagram and WhatsApp.",
      done: row.has_lead,
    },
  ];

  return {
    workspaceName: row.name,
    businessTypeName: row.business_type_name,
    setup,
    setupDone: setup.filter((s) => s.done).length,
    setupTotal: setup.length,
    team: { members, pendingInvites },
    sales,
    upcomingEvents: upcoming,
    money,
    tasks,
    deliverables,
    billing,
    starterPack: row.starter_pack,
  };
}

/** Confirmed events with a function in the next 14 days (business time zone). Freelancers see the ones they're on. */
async function upcomingEvents(db: Db, ctx: MemberContext) {
  if (eventScope(ctx.role) === "none") return [];
  const { rows } = await db.query<{ today: string; until: string }>(
    `SELECT (now() AT TIME ZONE timezone)::date::text AS today,
            ((now() AT TIME ZONE timezone)::date + 14)::text AS until
       FROM workspaces WHERE id = $1`,
    [ctx.workspaceId],
  );
  const range = rows[0]!;
  const list = await listEvents(db, ctx, { from: range.today, to: range.until, status: "confirmed", limit: 50 });
  // Events without dates are listed elsewhere; Home shows only what's actually coming up.
  return list.filter((e) => e.startDate !== null).slice(0, 6);
}
