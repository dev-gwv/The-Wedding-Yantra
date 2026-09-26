import type { FastifyInstance } from "fastify";
import { markReadInput, notificationListQuery, notificationPrefsInput, pushSubscriptionInput, pushUnsubscribeInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { ok, parse } from "../../lib/http.js";
import { requireMember, requireUser } from "../auth/guard.js";
import { removeSubscription, saveSubscription, type Pusher } from "./push.js";
import * as alerts from "./service.js";

type Ws = { Params: { workspaceId: string } };

export function notificationRoutes(app: FastifyInstance, deps: { db: Db; pusher: Pusher; publicKey: () => Promise<string> }) {
  const { db, pusher } = deps;

  app.get<Ws>("/workspaces/:workspaceId/notifications", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await alerts.listNotifications(db, ctx, parse(notificationListQuery, request.query)));
  });
  // Cheap enough to ask every minute, for the bell.
  app.get<Ws>("/workspaces/:workspaceId/notifications/unread", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok({ unread: await alerts.unreadCount(db, ctx) });
  });
  app.post<Ws>("/workspaces/:workspaceId/notifications/read", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok({ unread: await alerts.markRead(db, ctx, parse(markReadInput, request.body)) });
  });
  app.get<Ws>("/workspaces/:workspaceId/notifications/prefs", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await alerts.getPrefs(db, ctx));
  });
  app.put<Ws>("/workspaces/:workspaceId/notifications/prefs", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    return ok(await alerts.savePrefs(db, ctx, parse(notificationPrefsInput, request.body)));
  });
  /** Sends yourself an alert, to see it arrive on this phone. */
  app.post<Ws>("/workspaces/:workspaceId/notifications/test", async (request) => {
    const ctx = await requireMember(db, request, request.params.workspaceId);
    await alerts.notify(db, [
      { workspaceId: ctx.workspaceId, userId: ctx.userId, kind: "test", title: "Alerts are on", body: "This is how tasks and reminders will reach you.", link: "/app/notifications" },
    ]);
    await pusher.flush();
    return ok({ sent: true as const });
  });

  // ---- Push to installed apps and browsers (per person, not per business) ----------
  app.get("/push/key", async (request) => {
    requireUser(request);
    return ok({ publicKey: await deps.publicKey() });
  });
  app.post("/push/subscriptions", async (request, reply) => {
    const auth = requireUser(request);
    const sub = parse(pushSubscriptionInput, request.body);
    await saveSubscription(db, auth.userId, sub, request.headers["user-agent"] ?? null);
    return reply.status(201).send(ok({ subscribed: true as const }));
  });
  app.post("/push/unsubscribe", async (request) => {
    const auth = requireUser(request);
    await removeSubscription(db, auth.userId, parse(pushUnsubscribeInput, request.body).endpoint);
    return ok({ subscribed: false as const });
  });
}
