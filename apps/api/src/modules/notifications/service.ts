import { DEFAULT_QUIET, groupOf, type NotificationGroup, type NotificationKind } from "@wedding-yantra/core";
import type { NotificationItem, NotificationList, NotificationPrefs } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import type { MemberContext } from "../auth/guard.js";

export interface NotifyInput {
  workspaceId: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Who caused it; nobody is told about their own doing */
  actorId?: string | null;
  /** One alert per key per person, for scheduled ones */
  dedupeKey?: string | null;
}

/**
 * Records alerts for people, skipping anyone who switched that kind off, anyone who did
 * the thing themselves, and anyone no longer in the business. Push goes out after the
 * change is saved (see push.ts `flushPush`), so a change that's rolled back never buzzes
 * a phone. Returns how many were recorded.
 */
export async function notify(db: Queryable, items: NotifyInput[]): Promise<number> {
  const wanted = items.filter((n) => n.userId && n.userId !== n.actorId);
  if (!wanted.length) return 0;
  // One per person per thing, even if they're both the giver and mentioned.
  const seen = new Set<string>();
  const unique = wanted.filter((n) => {
    const key = `${n.workspaceId}:${n.userId}:${n.kind}:${n.entityId ?? ""}:${n.dedupeKey ?? ""}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });

  const { rows } = await db.query<{ user_id: string; workspace_id: string; off: string[] | null; push: boolean | null }>(
    `SELECT m.user_id, m.workspace_id, p.off, p.push
       FROM memberships m
       LEFT JOIN notification_prefs p ON p.user_id = m.user_id AND p.workspace_id = m.workspace_id
      WHERE m.removed_at IS NULL AND (m.workspace_id, m.user_id) IN (SELECT * FROM unnest($1::uuid[], $2::uuid[]))`,
    [unique.map((n) => n.workspaceId), unique.map((n) => n.userId)],
  );
  const prefs = new Map(rows.map((r) => [`${r.workspace_id}:${r.user_id}`, r]));

  let count = 0;
  for (const n of unique) {
    const p = prefs.get(`${n.workspaceId}:${n.userId}`);
    if (!p) continue;
    const group = groupOf(n.kind);
    if (group && (p.off ?? []).includes(group)) continue;
    const { rowCount } = await db.query(
      `INSERT INTO notifications (workspace_id, user_id, kind, title, body, link, entity_type, entity_id, actor_id, dedupe_key, push_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [
        n.workspaceId,
        n.userId,
        n.kind,
        n.title.slice(0, 200),
        (n.body ?? "").slice(0, 500),
        n.link ?? null,
        n.entityType ?? null,
        n.entityId ?? null,
        n.actorId ?? null,
        n.dedupeKey ?? null,
        p.push === false ? "off" : "pending",
      ],
    );
    count += rowCount ?? 0;
  }
  return count;
}

type Row = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  read_at: Date | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: Date;
};

const toItem = (r: Row): NotificationItem => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link,
  read: r.read_at !== null,
  actor: r.actor_id ? { id: r.actor_id, name: r.actor_name } : null,
  createdAt: r.created_at.toISOString(),
});

export async function unreadCount(db: Queryable, ctx: MemberContext): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL`,
    [ctx.userId, ctx.workspaceId],
  );
  return rows[0]!.n;
}

export async function listNotifications(
  db: Queryable,
  ctx: MemberContext,
  q: { unread?: boolean; before?: string; limit: number },
): Promise<NotificationList> {
  const params: unknown[] = [ctx.userId, ctx.workspaceId, q.limit + 1];
  const where = ["n.user_id = $1", "n.workspace_id = $2"];
  if (q.unread) where.push("n.read_at IS NULL");
  if (q.before) {
    params.push(q.before);
    where.push(`n.created_at < $${params.length}`);
  }
  const { rows } = await db.query<Row>(
    `SELECT n.id, n.kind, n.title, n.body, n.link, n.read_at, n.actor_id, u.name AS actor_name, n.created_at
       FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
      WHERE ${where.join(" AND ")}
      ORDER BY n.created_at DESC, n.id DESC LIMIT $3`,
    params,
  );
  const more = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  return {
    items: page.map(toItem),
    unread: await unreadCount(db, ctx),
    nextBefore: more ? page[page.length - 1]!.created_at.toISOString() : null,
  };
}

export async function markRead(db: Queryable, ctx: MemberContext, input: { ids: string[] } | { all: true }): Promise<number> {
  if ("all" in input) {
    await db.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND workspace_id = $2 AND read_at IS NULL`, [
      ctx.userId,
      ctx.workspaceId,
    ]);
  } else {
    await db.query(
      `UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE user_id = $1 AND workspace_id = $2 AND id = ANY($3::uuid[])`,
      [ctx.userId, ctx.workspaceId, input.ids],
    );
  }
  return unreadCount(db, ctx);
}

/** Opening a task reads its alerts too, so the bell doesn't nag about something already seen. */
export async function markEntityRead(db: Queryable, ctx: MemberContext, entityId: string): Promise<void> {
  await db.query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND workspace_id = $2 AND entity_id = $3 AND read_at IS NULL`,
    [ctx.userId, ctx.workspaceId, entityId],
  );
}

export async function getPrefs(db: Queryable, ctx: MemberContext): Promise<NotificationPrefs> {
  const [prefs, devices] = await Promise.all([
    db.query<{ off: string[]; push: boolean; quiet_from: string | null; quiet_to: string | null }>(
      `SELECT off, push, to_char(quiet_from, 'HH24:MI') AS quiet_from, to_char(quiet_to, 'HH24:MI') AS quiet_to
         FROM notification_prefs WHERE user_id = $1 AND workspace_id = $2`,
      [ctx.userId, ctx.workspaceId],
    ),
    db.query<{ n: number }>(`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1`, [ctx.userId]),
  ]);
  const p = prefs.rows[0];
  return {
    off: (p?.off ?? []) as NotificationGroup[],
    push: p?.push ?? true,
    quietFrom: p ? p.quiet_from : DEFAULT_QUIET.from,
    quietTo: p ? p.quiet_to : DEFAULT_QUIET.to,
    devices: devices.rows[0]!.n,
  };
}

export async function savePrefs(
  db: Queryable,
  ctx: MemberContext,
  input: { off: NotificationGroup[]; push: boolean; quietFrom: string | null; quietTo: string | null },
): Promise<NotificationPrefs> {
  await db.query(
    `INSERT INTO notification_prefs (user_id, workspace_id, off, push, quiet_from, quiet_to)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, workspace_id) DO UPDATE
       SET off = EXCLUDED.off, push = EXCLUDED.push, quiet_from = EXCLUDED.quiet_from, quiet_to = EXCLUDED.quiet_to, updated_at = now()`,
    [ctx.userId, ctx.workspaceId, [...new Set(input.off)], input.push, input.quietFrom, input.quietTo],
  );
  return getPrefs(db, ctx);
}
