import type { FastifyInstance } from "fastify";
import {
  saveChecklistInput,
  saveEventTeamInput,
  setTaskDoneInput,
  taskInput,
  taskListQuery,
  taskRepeatInput,
  timeOffInput,
  timeOffQuery,
  updateTaskInput,
} from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as repeats from "./repeats.js";
import * as tasks from "./service.js";
import * as timeOff from "./time-off.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

export function taskRoutes(app: FastifyInstance, deps: { db: Db }) {
  const { db } = deps;
  const member = (request: Parameters<typeof requireMember>[1], workspaceId: string) => requireMember(db, request, workspaceId);

  // ---- Repeating tasks ------------------------------------------------------------
  app.get<Ws & { Querystring: { scope?: string } }>("/workspaces/:workspaceId/task-repeats", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await repeats.listRepeats(db, ctx, request.query.scope === "team" ? "team" : "mine"));
  });
  app.post<Ws>("/workspaces/:workspaceId/task-repeats", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await repeats.createRepeat(db, ctx, parse(taskRepeatInput, request.body))));
  });
  app.delete<WsId>("/workspaces/:workspaceId/task-repeats/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await repeats.stopRepeat(db, ctx, assertId(request.params.id, "This repeating task"));
    return ok({ stopped: true as const });
  });

  // ---- Tasks ------------------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/tasks", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await tasks.listTasks(db, ctx, parse(taskListQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/tasks", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await tasks.createTask(db, ctx, parse(taskInput, request.body))));
  });
  app.patch<WsId>("/workspaces/:workspaceId/tasks/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await tasks.updateTask(db, ctx, assertId(request.params.id, "This task"), parse(updateTaskInput, request.body)));
  });
  app.post<WsId>("/workspaces/:workspaceId/tasks/:id/done", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const { done } = parse(setTaskDoneInput, request.body);
    return ok(await tasks.setTaskDone(db, ctx, assertId(request.params.id, "This task"), done));
  });
  app.delete<WsId>("/workspaces/:workspaceId/tasks/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await tasks.deleteTask(db, ctx, assertId(request.params.id, "This task"));
    return ok({ deleted: true as const });
  });
  app.get<Ws>("/workspaces/:workspaceId/my-day", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await tasks.myDay(db, ctx));
  });

  // ---- The checklist every event starts with ------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/checklist", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await tasks.getChecklist(db, ctx));
  });
  app.put<Ws>("/workspaces/:workspaceId/checklist", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await tasks.saveChecklist(db, ctx, parse(saveChecklistInput, request.body).items));
  });
  app.post<WsId>("/workspaces/:workspaceId/events/:id/checklist", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await tasks.applyChecklist(db, ctx, assertId(request.params.id, "This event")));
  });

  // ---- Days off --------------------------------------------------------------------
  app.get<Ws>("/workspaces/:workspaceId/time-off", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await timeOff.listTimeOff(db, ctx, parse(timeOffQuery, request.query)));
  });
  app.post<Ws>("/workspaces/:workspaceId/time-off", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    return reply.status(201).send(ok(await timeOff.addTimeOff(db, ctx, parse(timeOffInput, request.body))));
  });
  app.delete<WsId>("/workspaces/:workspaceId/time-off/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    await timeOff.removeTimeOff(db, ctx, assertId(request.params.id, "These days off"));
    return ok({ deleted: true as const });
  });

  // ---- Who works an event ------------------------------------------------------
  app.put<WsId>("/workspaces/:workspaceId/events/:id/team", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const { members } = parse(saveEventTeamInput, request.body);
    return ok(await tasks.saveEventTeam(db, ctx, assertId(request.params.id, "This event"), members));
  });
}
