import type { FastifyInstance } from "fastify";
import {
  attachFileInput,
  commentInput,
  moveTaskInput,
  reviewTaskInput,
  snoozeTaskInput,
  stepInput,
  submitTaskInput,
  updateStepInput,
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
import type { Files } from "../files/service.js";
import * as delegation from "./delegation.js";
import { assertId, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import * as repeats from "./repeats.js";
import * as tasks from "./service.js";
import * as timeOff from "./time-off.js";

type Ws = { Params: { workspaceId: string } };
type WsId = { Params: { workspaceId: string; id: string } };

type WsTask = { Params: { workspaceId: string; id: string; itemId: string } };

export function taskRoutes(app: FastifyInstance, deps: { db: Db; files: Files }) {
  const { db, files } = deps;
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
  // ---- Delegation: one task in full, moving, handing in, checking ----------------------
  app.get<Ws>("/workspaces/:workspaceId/tasks/board", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await delegation.peopleBoard(db, ctx));
  });
  app.get<WsId>("/workspaces/:workspaceId/tasks/:id", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    return ok(await delegation.getTaskDetail(db, files.secret, ctx, assertId(request.params.id, "This task")));
  });
  const detail = async (ctx: Awaited<ReturnType<typeof member>>, id: string) => delegation.getTaskDetail(db, files.secret, ctx, id);
  app.post<WsId>("/workspaces/:workspaceId/tasks/:id/move", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.moveTask(db, ctx, id, parse(moveTaskInput, request.body));
    return ok(await detail(ctx, id));
  });
  app.post<WsId>("/workspaces/:workspaceId/tasks/:id/submit", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.submitTask(db, ctx, id, parse(submitTaskInput, request.body));
    return ok(await detail(ctx, id));
  });
  app.post<WsId>("/workspaces/:workspaceId/tasks/:id/review", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.reviewTask(db, ctx, id, parse(reviewTaskInput, request.body));
    return ok(await detail(ctx, id));
  });
  app.post<WsId>("/workspaces/:workspaceId/tasks/:id/snooze", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.snoozeTask(db, ctx, id, parse(snoozeTaskInput, request.body));
    return ok(await detail(ctx, id));
  });
  app.post<WsId>("/workspaces/:workspaceId/tasks/:id/steps", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.addStep(db, ctx, id, parse(stepInput, request.body).title);
    return reply.status(201).send(ok(await detail(ctx, id)));
  });
  app.patch<WsTask>("/workspaces/:workspaceId/tasks/:id/steps/:itemId", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.updateStep(db, ctx, id, assertId(request.params.itemId, "This step"), parse(updateStepInput, request.body));
    return ok(await detail(ctx, id));
  });
  app.delete<WsTask>("/workspaces/:workspaceId/tasks/:id/steps/:itemId", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.deleteStep(db, ctx, id, assertId(request.params.itemId, "This step"));
    return ok(await detail(ctx, id));
  });
  app.post<WsId>("/workspaces/:workspaceId/tasks/:id/comments", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.addComment(db, ctx, id, parse(commentInput, request.body));
    return reply.status(201).send(ok(await detail(ctx, id)));
  });
  app.delete<WsTask>("/workspaces/:workspaceId/tasks/:id/comments/:itemId", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.deleteComment(db, ctx, id, assertId(request.params.itemId, "This comment"));
    return ok(await detail(ctx, id));
  });
  app.post<WsId>("/workspaces/:workspaceId/tasks/:id/files", async (request, reply) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.attachFile(db, ctx, id, parse(attachFileInput, request.body).fileId);
    return reply.status(201).send(ok(await detail(ctx, id)));
  });
  app.delete<WsTask>("/workspaces/:workspaceId/tasks/:id/files/:itemId", async (request) => {
    const ctx = await member(request, request.params.workspaceId);
    const id = assertId(request.params.id, "This task");
    await delegation.detachFile(db, ctx, id, assertId(request.params.itemId, "This file"));
    return ok(await detail(ctx, id));
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
