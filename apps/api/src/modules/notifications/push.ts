import webpush from "web-push";
import type { Queryable } from "../../db.js";
import { DEFAULT_QUIET, inQuietHours } from "@wedding-yantra/core";

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Sends one push. Throws an error with `statusCode` when the push service refuses. */
export type PushSend = (target: PushTarget, payload: string) => Promise<void>;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * The keys that sign pushes. From PUSH_VAPID_PUBLIC/PRIVATE when set; otherwise made once
 * and kept in the database, so alerts work with nothing to configure and phones stay
 * subscribed across restarts and deploys.
 */
export async function vapidKeys(db: Queryable, env: NodeJS.ProcessEnv = process.env): Promise<VapidKeys> {
  if (env.PUSH_VAPID_PUBLIC && env.PUSH_VAPID_PRIVATE) return { publicKey: env.PUSH_VAPID_PUBLIC, privateKey: env.PUSH_VAPID_PRIVATE };
  const read = async () => (await db.query<{ value: VapidKeys }>(`SELECT value FROM app_keys WHERE name = 'vapid'`)).rows[0]?.value;
  const saved = await read();
  if (saved) return saved;
  const made = webpush.generateVAPIDKeys();
  await db.query(`INSERT INTO app_keys (name, value) VALUES ('vapid', $1) ON CONFLICT (name) DO NOTHING`, [made]);
  // Two servers starting at once: whichever saved first wins.
  return (await read())!;
}

export function webPushSender(keys: VapidKeys, subject: string): PushSend {
  return async (target, payload) => {
    await webpush.sendNotification(target, payload, {
      vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 12 * 60 * 60,
      urgency: "normal",
    });
  };
}

export async function saveSubscription(db: Queryable, userId: string, sub: PushTarget, userAgent: string | null): Promise<void> {
  // A browser belongs to whoever signed in on it last.
  await db.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, failures = 0`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 300) ?? null],
  );
}

export async function removeSubscription(db: Queryable, userId: string, endpoint: string): Promise<void> {
  await db.query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, endpoint]);
}

type Claimed = {
  id: string;
  user_id: string;
  workspace_id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  entity_id: string | null;
  clock: string;
  has_prefs: boolean;
  quiet_from: string | null;
  quiet_to: string | null;
};

/** Adds the business to a link, so tapping an alert opens the right business. */
export function withWorkspace(link: string | null, workspaceId: string): string {
  const path = link ?? "/app/notifications";
  return `${path}${path.includes("?") ? "&" : "?"}ws=${workspaceId}`;
}

/**
 * Pushes alerts that are waiting, to every phone and browser the person turned alerts on.
 * Each alert is claimed before sending, so two servers never push the same one. Alerts in
 * someone's quiet hours stay in the app without buzzing. Returns how many were pushed.
 */
export async function flushPush(db: Queryable, send: PushSend | null): Promise<number> {
  await db.query(`UPDATE notifications SET push_state = 'expired' WHERE push_state = 'pending' AND created_at < now() - interval '1 day'`);
  const { rows } = await db.query<Claimed>(
    `WITH picked AS (
       SELECT id FROM notifications WHERE push_state = 'pending' ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED
     ), claimed AS (
       UPDATE notifications n SET push_state = 'sent' FROM picked WHERE n.id = picked.id
       RETURNING n.id, n.user_id, n.workspace_id, n.kind, n.title, n.body, n.link, n.entity_id
     )
     SELECT c.*, to_char(now() AT TIME ZONE w.timezone, 'HH24:MI') AS clock, (p.user_id IS NOT NULL) AS has_prefs,
            to_char(p.quiet_from, 'HH24:MI') AS quiet_from, to_char(p.quiet_to, 'HH24:MI') AS quiet_to
       FROM claimed c
       JOIN workspaces w ON w.id = c.workspace_id
       LEFT JOIN notification_prefs p ON p.user_id = c.user_id AND p.workspace_id = c.workspace_id`,
  );
  if (!rows.length) return 0;

  const users = [...new Set(rows.map((r) => r.user_id))];
  const subs = await db.query<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>(
    `SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])`,
    [users],
  );
  const byUser = new Map<string, typeof subs.rows>();
  for (const s of subs.rows) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let pushed = 0;
  const gone = new Set<string>();
  for (const n of rows) {
    const quietFrom = n.has_prefs ? n.quiet_from : DEFAULT_QUIET.from;
    const quietTo = n.has_prefs ? n.quiet_to : DEFAULT_QUIET.to;
    const targets = (byUser.get(n.user_id) ?? []).filter((s) => !gone.has(s.id));
    let state: "sent" | "none" | "quiet" = "sent";
    if (n.kind !== "test" && inQuietHours(n.clock, quietFrom, quietTo)) state = "quiet";
    else if (!targets.length || !send) state = "none";
    else {
      const payload = JSON.stringify({
        id: n.id,
        title: n.title,
        body: n.body,
        url: withWorkspace(n.link, n.workspace_id),
        // One card per task on the phone: a newer alert about it replaces the older.
        tag: n.entity_id ?? n.id,
      });
      let delivered = false;
      for (const s of targets) {
        try {
          await send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          delivered = true;
          await db.query(`UPDATE push_subscriptions SET last_ok_at = now(), failures = 0 WHERE id = $1`, [s.id]);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The browser unsubscribed or the app was removed: forget it.
          if (status === 404 || status === 410) {
            gone.add(s.id);
            await db.query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
          } else {
            await db.query(`UPDATE push_subscriptions SET failures = failures + 1 WHERE id = $1`, [s.id]);
          }
        }
      }
      if (delivered) pushed++;
      else state = "none";
    }
    if (state !== "sent") await db.query(`UPDATE notifications SET push_state = $2 WHERE id = $1`, [n.id, state]);
  }
  // Keep trying a browser that fails for a while, then stop.
  await db.query(`DELETE FROM push_subscriptions WHERE failures >= 20`);
  return pushed;
}

/** Pushes soon after a change, batching several changes made close together. */
export function createPusher(db: Queryable, send: PushSend | null, onError: (err: unknown) => void) {
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<unknown> | null = null;
  const flush = async () => {
    if (running) await running.catch(() => undefined);
    running = flushPush(db, send).catch(onError);
    await running;
    running = null;
  };
  return {
    flush,
    nudge() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void flush();
      }, 250);
      timer.unref();
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
export type Pusher = ReturnType<typeof createPusher>;
