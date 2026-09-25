import type { FastifyInstance } from "fastify";
import {
  acceptQuoteInput,
  catalogueItemInput,
  clashQuery,
  declineQuoteInput,
  eventInput,
  eventListQuery,
  QUOTE_STATUSES,
  quoteInput,
  updateCatalogueItemInput,
  updateEventInput,
  updateQuoteInput,
} from "@wedding-yantra/types";
import { z } from "zod";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as catalogue from "./catalogue.js";
import * as events from "./events.js";
import * as quotes from "./quotes.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

const quoteListQuery = z.object({
  leadId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  status: z.enum(QUOTE_STATUSES).optional(),
});

export function bookingRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  const member = (request: Parameters<typeof requireMember>[1], workspaceId: string) => requireMember(db, request, workspaceId);

  // ---- Price list -----------------------------------------------------------
  app.get<Ws & { Querystring: { all?: string } }>("/workspaces/:workspaceId/catalogue", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await catalogue.listCatalogue(db, ctx, request.query.all === "true"));
  });
  app.post<Ws>("/workspaces/:workspaceId/catalogue", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await catalogue.createCatalogueItem(db, ctx, parse(catalogueItemInput, request.body))));
  });
  app.patch<WsId>("/workspaces/:workspaceId/catalogue/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This service");
    return ok(await catalogue.updateCatalogueItem(db, ctx, id, parse(updateCatalogueItemInput, request.body)));
  });

  // ---- Quotes ---------------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/quotes", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await quotes.listQuotes(db, ctx, parse(quoteListQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/quotes", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await quotes.createQuote(db, ctx, parse(quoteInput, request.body))));
  });
  app.get<WsId>("/workspaces/:workspaceId/quotes/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await quotes.getQuote(db, ctx, assertId(request.params.id, "This quote")));
  });
  app.patch<WsId>("/workspaces/:workspaceId/quotes/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This quote");
    return ok(await quotes.updateQuote(db, ctx, id, parse(updateQuoteInput, request.body)));
  });
  app.delete<WsId>("/workspaces/:workspaceId/quotes/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await quotes.deleteQuote(db, ctx, assertId(request.params.id, "This quote"));
    return ok({ deleted: true as const });
  });
  app.post<WsId>("/workspaces/:workspaceId/quotes/:id/send", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await quotes.markSent(db, ctx, assertId(request.params.id, "This quote")));
  });
  app.post<WsId>("/workspaces/:workspaceId/quotes/:id/accept", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await quotes.acceptQuote(db, ctx, assertId(request.params.id, "This quote")));
  });
  app.post<WsId>("/workspaces/:workspaceId/quotes/:id/decline", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const { reason } = parse(declineQuoteInput, request.body);
    return ok(await quotes.declineQuote(db, ctx, assertId(request.params.id, "This quote"), reason ?? null));
  });

  // Public: the client opens the link, reads the quote and says yes or no.
  app.get<{ Params: { token: string } }>("/public/quotes/:token", async (request) => {
    return ok(await quotes.getPublicQuote(db, request.params.token));
  });
  app.post<{ Params: { token: string } }>("/public/quotes/:token/accept", async (request) => {
    const { name } = parse(acceptQuoteInput, request.body);
    return ok(await quotes.acceptPublicQuote(db, request.params.token, name));
  });
  app.post<{ Params: { token: string } }>("/public/quotes/:token/decline", async (request) => {
    const { reason } = parse(declineQuoteInput, request.body);
    return ok(await quotes.declinePublicQuote(db, request.params.token, reason ?? null));
  });

  // ---- Events and calendar --------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/events", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await events.listEvents(db, ctx, parse(eventListQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/events", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await events.createEvent(db, ctx, parse(eventInput, request.body))));
  });
  app.get<WsId>("/workspaces/:workspaceId/events/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await events.getEvent(db, ctx, assertId(request.params.id, "This event")));
  });
  app.patch<WsId>("/workspaces/:workspaceId/events/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This event");
    return ok(await events.updateEvent(db, ctx, id, parse(updateEventInput, request.body)));
  });
  app.delete<WsId>("/workspaces/:workspaceId/events/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await events.deleteEvent(db, ctx, assertId(request.params.id, "This event"));
    return ok({ deleted: true as const });
  });
  app.get<Ws>("/workspaces/:workspaceId/event-clashes", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const { dates, excludeEventId } = parse(clashQuery, request.query);
    return ok(await events.clashesFor(db, ctx, dates, excludeEventId));
  });
  app.get<Ws & { Querystring: { month?: string } }>("/workspaces/:workspaceId/calendar", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await events.calendar(db, ctx, String(request.query.month ?? "")));
  });
}
