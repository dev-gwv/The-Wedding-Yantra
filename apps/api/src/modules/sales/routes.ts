import type { FastifyInstance } from "fastify";
import {
  addActivityInput,
  clientInput,
  createLeadInput,
  leadListQuery,
  saveStagesInput,
  submitLeadFormInput,
  templateInput,
  updateClientInput,
  updateLeadFormInput,
  updateLeadInput,
} from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as clients from "./clients.js";
import * as leads from "./leads.js";
import * as publicForm from "./public-form.js";
import * as settings from "./settings.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

export function salesRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  const member = (request: Parameters<typeof requireMember>[1], workspaceId: string) =>
    requireMember(db, request, workspaceId);

  // ---- Leads ----------------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/leads", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const q = parse(leadListQuery, request.query);
    return ok(await leads.listLeads(db, ctx, { ...q, mine: q.mine === "true" }));
  });

  app.post<Ws>("/workspaces/:workspaceId/leads", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    const lead = await leads.createLead(db, ctx, parse(createLeadInput, request.body));
    return reply.status(201).send(ok(lead));
  });

  app.get<WsId>("/workspaces/:workspaceId/leads/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await leads.getLead(db, ctx, assertId(request.params.id, "This lead")));
  });

  app.patch<WsId>("/workspaces/:workspaceId/leads/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This lead");
    return ok(await leads.updateLead(db, ctx, id, parse(updateLeadInput, request.body)));
  });

  app.delete<WsId>("/workspaces/:workspaceId/leads/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await leads.deleteLead(db, ctx, assertId(request.params.id, "This lead"));
    return ok({ deleted: true as const });
  });

  app.post<WsId>("/workspaces/:workspaceId/leads/:id/activities", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This lead");
    const lead = await leads.addActivity(db, ctx, id, parse(addActivityInput, request.body));
    return reply.status(201).send(ok(lead));
  });

  // ---- Sales stages ---------------------------------------------------------
  app.put<Ws>("/workspaces/:workspaceId/pipeline-stages", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const { stages } = parse(saveStagesInput, request.body);
    return ok(await settings.saveStages(db, ctx, stages));
  });

  // ---- Clients --------------------------------------------------------------
  app.get<Ws & { Querystring: { q?: string } }>("/workspaces/:workspaceId/clients", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const q = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 80) : undefined;
    return ok(await clients.listClients(db, ctx, q || undefined));
  });

  app.post<Ws>("/workspaces/:workspaceId/clients", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    const client = await clients.createClient(db, ctx, parse(clientInput, request.body));
    return reply.status(201).send(ok(client));
  });

  app.get<WsId>("/workspaces/:workspaceId/clients/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await clients.getClient(db, ctx, assertId(request.params.id, "This client")));
  });

  app.patch<WsId>("/workspaces/:workspaceId/clients/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This client");
    return ok(await clients.updateClient(db, ctx, id, parse(updateClientInput, request.body)));
  });

  // ---- WhatsApp quick replies -----------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/whatsapp-templates", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await settings.listTemplates(db, ctx));
  });

  app.post<Ws>("/workspaces/:workspaceId/whatsapp-templates", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await settings.createTemplate(db, ctx, parse(templateInput, request.body))));
  });

  app.patch<WsId>("/workspaces/:workspaceId/whatsapp-templates/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This quick reply");
    return ok(await settings.updateTemplate(db, ctx, id, parse(templateInput.partial(), request.body)));
  });

  app.delete<WsId>("/workspaces/:workspaceId/whatsapp-templates/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await settings.deleteTemplate(db, ctx, assertId(request.params.id, "This quick reply"));
    return ok({ deleted: true as const });
  });

  // ---- Enquiry form ---------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/lead-form", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await settings.getLeadForm(db, ctx));
  });

  app.patch<Ws>("/workspaces/:workspaceId/lead-form", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const { enabled } = parse(updateLeadFormInput, request.body);
    return ok(await settings.setLeadFormEnabled(db, ctx, enabled));
  });

  // Public: no sign-in. Anyone with the link can see the form and send an enquiry.
  app.get<{ Params: { slug: string } }>("/public/forms/:slug", async (request) => {
    return ok(await publicForm.getPublicForm(db, request.params.slug));
  });

  app.post<{ Params: { slug: string } }>("/public/forms/:slug", async (request, reply) => {
    const input = parse(submitLeadFormInput, request.body);
    return reply.status(201).send(ok(await publicForm.submitPublicForm(db, request.params.slug, request.ip, input)));
  });
}
