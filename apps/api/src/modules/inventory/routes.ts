import type { FastifyInstance } from "fastify";
import {
  inventoryBookingInput,
  inventoryBookingListQuery,
  inventoryItemInput,
  inventoryListQuery,
  updateInventoryBookingInput,
  updateInventoryItemInput,
} from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as inventory from "./service.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

/** Phase 6, Grow: stock, and what each event needs of it. */
export function inventoryRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  const member = (request: Parameters<typeof requireMember>[1], workspaceId: string) => requireMember(db, request, workspaceId);

  app.get<Ws>("/workspaces/:workspaceId/inventory", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await inventory.listItems(db, ctx, parse(inventoryListQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/inventory", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await inventory.createItem(db, ctx, parse(inventoryItemInput, request.body))));
  });
  app.patch<WsId>("/workspaces/:workspaceId/inventory/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await inventory.updateItem(db, ctx, assertId(request.params.id, "This item"), parse(updateInventoryItemInput, request.body)));
  });
  app.delete<WsId>("/workspaces/:workspaceId/inventory/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await inventory.deleteItem(db, ctx, assertId(request.params.id, "This item"));
    return ok({ deleted: true as const });
  });

  app.get<Ws>("/workspaces/:workspaceId/inventory-bookings", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await inventory.listBookings(db, ctx, parse(inventoryBookingListQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/inventory-bookings", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await inventory.createBooking(db, ctx, parse(inventoryBookingInput, request.body))));
  });
  app.patch<WsId>("/workspaces/:workspaceId/inventory-bookings/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await inventory.updateBooking(db, ctx, assertId(request.params.id, "This booking"), parse(updateInventoryBookingInput, request.body)));
  });
  app.delete<WsId>("/workspaces/:workspaceId/inventory-bookings/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await inventory.deleteBooking(db, ctx, assertId(request.params.id, "This booking"));
    return ok({ deleted: true as const });
  });
}
