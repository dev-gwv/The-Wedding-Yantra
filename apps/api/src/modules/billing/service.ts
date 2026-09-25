import { billingStatus, can, daysLeft, PLAN_INFO, TRIAL_PLAN, type BillingPeriod, type BillingStatus, type Plan } from "@wedding-yantra/core";
import type { BillingOverview, Checkout } from "@wedding-yantra/types";
import type { Config } from "../../config.js";
import type { Db, Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import type { PaymentGateway } from "./gateway.js";

type SubStatus = "created" | "active" | "past_due" | "cancelled" | "completed";

interface Standing {
  status: BillingStatus;
  trialEndsAt: string;
  /** The plan paid for, while it counts */
  plan: Plan | null;
  period: BillingPeriod | null;
  currentPeriodEnd: string | null;
  cancelled: boolean;
  /** The plan whose limits apply now: the paid one, or the biggest during the trial */
  limitsOf: Plan | null;
}

/** Where a business stands: trial, paying, or run out. */
export async function standing(db: Queryable, workspaceId: string): Promise<Standing> {
  const { rows } = await db.query<{
    trial_ends_at: Date;
    plan: Plan | null;
    period: BillingPeriod | null;
    status: SubStatus | null;
    current_period_end: Date | null;
  }>(
    `SELECT w.trial_ends_at, s.plan, s.period, s.status, s.current_period_end
       FROM workspaces w
       LEFT JOIN LATERAL (
         -- The subscription that counts: a live one first, else the latest.
         SELECT plan, period, status, current_period_end FROM subscriptions
          WHERE workspace_id = w.id
          ORDER BY (status IN ('active', 'past_due')) DESC, created_at DESC LIMIT 1
       ) s ON true
      WHERE w.id = $1`,
    [workspaceId],
  );
  const r = rows[0];
  if (!r) throw notFound("This business");
  const subscription = r.status ? { status: r.status, currentPeriodEnd: r.current_period_end?.toISOString() ?? null } : null;
  const status = billingStatus({ trialEndsAt: r.trial_ends_at.toISOString(), subscription });
  const paid = status === "active" || status === "past_due";
  return {
    status,
    trialEndsAt: r.trial_ends_at.toISOString(),
    plan: paid ? r.plan : null,
    period: paid ? r.period : null,
    currentPeriodEnd: paid ? (r.current_period_end?.toISOString() ?? null) : null,
    cancelled: paid && (r.status === "cancelled" || r.status === "completed"),
    limitsOf: paid ? r.plan : status === "trial" ? TRIAL_PLAN : null,
  };
}

/** People on the team plus invitations still open. */
async function memberCount(db: Queryable, workspaceId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT (SELECT count(*) FROM memberships WHERE workspace_id = $1 AND removed_at IS NULL)
          + (SELECT count(*) FROM invitations WHERE workspace_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()) AS n`,
    [workspaceId],
  );
  return Number(rows[0]!.n);
}

/** Events added this calendar year, in the business's time zone. */
async function eventsThisYear(db: Queryable, workspaceId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*) AS n FROM events e JOIN workspaces w ON w.id = e.workspace_id
      WHERE e.workspace_id = $1 AND e.deleted_at IS NULL
        AND date_part('year', e.created_at AT TIME ZONE w.timezone) = date_part('year', now() AT TIME ZONE w.timezone)`,
    [workspaceId],
  );
  return Number(rows[0]!.n);
}

export async function billingOverview(db: Queryable, ctx: MemberContext, config: Config): Promise<BillingOverview> {
  if (!can(ctx.role, "billing.manage")) throw forbidden("Only the owner sees the plan and billing");
  const s = await standing(db, ctx.workspaceId);
  const limits = PLAN_INFO[s.limitsOf ?? "starter"];
  return {
    status: s.status,
    plan: s.plan,
    period: s.period,
    trialEndsAt: s.trialEndsAt,
    currentPeriodEnd: s.currentPeriodEnd,
    cancelled: s.cancelled,
    usage: {
      members: await memberCount(db, ctx.workspaceId),
      membersLimit: limits.members,
      eventsThisYear: await eventsThisYear(db, ctx.workspaceId),
      eventsLimit: limits.eventsPerYear,
    },
    onlinePayment: config.billing.razorpay !== null,
    enforced: config.billing.enforced,
  };
}

/** For Home: the owner's plan at a glance. */
export async function homeBilling(db: Queryable, ctx: MemberContext, config: Config) {
  if (!can(ctx.role, "billing.manage")) return null;
  const s = await standing(db, ctx.workspaceId);
  return { status: s.status, trialDaysLeft: daysLeft(s.trialEndsAt), enforced: config.billing.enforced };
}

/**
 * The plan's limits, checked before adding people or events. Only while billing is enforced.
 * During the trial the biggest plan's limits apply; once it runs out, nothing new can be added.
 */
export async function assertWithinPlan(db: Queryable, workspaceId: string, what: "write" | "member" | "event"): Promise<void> {
  const s = await standing(db, workspaceId);
  if (s.status === "expired" || !s.limitsOf) {
    throw new AppError(402, "PAYMENT_REQUIRED", "Your free trial has ended. Choose a plan in More, Plan and billing, to keep going.");
  }
  const limits = PLAN_INFO[s.limitsOf];
  if (what === "member" && (await memberCount(db, workspaceId)) >= limits.members) {
    throw new AppError(
      402,
      "PLAN_LIMIT",
      limits.members === 1
        ? `The ${limits.name} plan is for one person. Choose Studio or Business to add your team.`
        : `Your plan includes ${limits.members} people. Choose a bigger plan to add more.`,
    );
  }
  if (what === "event" && limits.eventsPerYear !== null && (await eventsThisYear(db, workspaceId)) >= limits.eventsPerYear) {
    throw new AppError(402, "PLAN_LIMIT", `Your plan includes ${limits.eventsPerYear} events a year. Choose Studio or Business for unlimited events.`);
  }
}

/** Starts paying online: a Razorpay subscription, and where the owner goes to pay. */
export async function startCheckout(
  db: Db,
  ctx: MemberContext,
  config: Config,
  gateway: PaymentGateway | null,
  input: { plan: Plan; period: BillingPeriod },
): Promise<Checkout> {
  if (!can(ctx.role, "billing.manage")) throw forbidden("Only the owner can choose a plan");
  const planId = config.billing.razorpay?.plans[`${input.plan}:${input.period}`];
  if (!gateway || !planId) {
    throw new AppError(503, "BILLING_UNAVAILABLE", "Paying online isn't switched on yet. Your trial keeps going in the meantime.");
  }
  const s = await standing(db, ctx.workspaceId);
  if ((s.status === "active" || s.status === "past_due") && !s.cancelled) {
    throw new AppError(409, "ALREADY_SUBSCRIBED", "You already have a plan. To change it, write to us and we'll move it over.");
  }
  // Monthly plans run up to ten years; yearly ones ten renewals.
  const sub = await gateway.createSubscription({
    planId,
    totalCount: input.period === "monthly" ? 120 : 10,
    notes: { workspace_id: ctx.workspaceId, plan: input.plan, period: input.period },
  });
  await db.query(
    `INSERT INTO subscriptions (workspace_id, plan, period, status, provider, provider_subscription_id, checkout_url, created_by)
     VALUES ($1, $2, $3, 'created', 'razorpay', $4, $5, $6)`,
    [ctx.workspaceId, input.plan, input.period, sub.id, sub.url, ctx.userId],
  );
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "billing.checkout_started",
    entityType: "workspace",
    entityId: ctx.workspaceId,
    meta: { plan: input.plan, period: input.period },
  });
  return { url: sub.url };
}

/** What each Razorpay subscription message means for us. Unlisted ones are only recorded. */
const RAZORPAY_STATUS: Record<string, SubStatus> = {
  "subscription.activated": "active",
  "subscription.charged": "active",
  "subscription.resumed": "active",
  "subscription.pending": "past_due",
  "subscription.halted": "past_due",
  "subscription.cancelled": "cancelled",
  "subscription.paused": "cancelled",
  "subscription.completed": "completed",
};

/**
 * A message from Razorpay about a subscription. Each message is handled once; a repeat of
 * one already handled changes nothing.
 */
export async function handleRazorpayEvent(db: Db, eventId: string, body: unknown): Promise<"handled" | "repeat" | "ignored"> {
  const event = body as {
    event?: string;
    payload?: { subscription?: { entity?: { id?: string; current_end?: number | null } } };
  };
  const type = typeof event.event === "string" ? event.event : "unknown";
  const inserted = await db.query(
    `INSERT INTO billing_events (provider, event_id, type, payload) VALUES ('razorpay', $1, $2, $3) ON CONFLICT DO NOTHING`,
    [eventId, type, body],
  );
  if (!inserted.rowCount) return "repeat";
  const entity = event.payload?.subscription?.entity;
  const status = RAZORPAY_STATUS[type];
  if (!entity?.id || !status) return "ignored";
  const periodEnd = typeof entity.current_end === "number" ? new Date(entity.current_end * 1000) : null;
  const { rows } = await db.query<{ workspace_id: string; plan: Plan }>(
    `UPDATE subscriptions SET status = $2, current_period_end = coalesce($3, current_period_end)
      WHERE provider = 'razorpay' AND provider_subscription_id = $1
      RETURNING workspace_id, plan`,
    [entity.id, status, periodEnd],
  );
  if (!rows[0]) return "ignored";
  await logActivity(db, {
    workspaceId: rows[0].workspace_id,
    actorUserId: null,
    action: `billing.${status}`,
    entityType: "workspace",
    entityId: rows[0].workspace_id,
    meta: { plan: rows[0].plan, event: type },
  });
  return "handled";
}

/** A plan paid another way (UPI, bank transfer), recorded by whoever runs the service. */
export async function setManualPlan(
  db: Db,
  workspaceId: string,
  input: { plan: Plan; period: BillingPeriod; until: string; note?: string | null },
): Promise<{ plan: Plan; until: string }> {
  const w = await db.query(`SELECT 1 FROM workspaces WHERE id = $1 AND deleted_at IS NULL`, [workspaceId]);
  if (!w.rowCount) throw notFound("This business");
  // Paid up to the end of that day in India.
  await db.query(
    `INSERT INTO subscriptions (workspace_id, plan, period, status, provider, current_period_end, note)
     VALUES ($1, $2, $3, 'active', 'manual', ($4::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata', $5)`,
    [workspaceId, input.plan, input.period, input.until, input.note ?? null],
  );
  return { plan: input.plan, until: input.until };
}
