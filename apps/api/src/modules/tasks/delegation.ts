import { canMove, type TaskStatus } from "@wedding-yantra/core";
import type { PeopleBoard, TaskDetail, TaskHistoryItem, TaskItem, TaskStep } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { assertWorkspaceFile, toUploaded } from "../files/service.js";
import { taskAlert } from "./alerts.js";
import { awardFinished, awardMoved, awardSentBack } from "../review/points.js";
import { loadTask, manages, taskEvent, toTask, type TaskRow } from "./service.js";

/** Whether a finished task was on time: finished on or before its day, in the business's time zone. */
const LATE_SQL = `(t.due_date IS NOT NULL AND (coalesce(t.completed_at, now()) AT TIME ZONE w.timezone)::date > t.due_date)`;

function roles(ctx: MemberContext, row: TaskRow) {
  return {
    manages: manages(ctx),
    isGiver: row.created_by === ctx.userId,
    // Nobody named: anyone who can see it (on the event) works it.
    isAssignee: row.assignee_id === ctx.userId || row.assignee_id === null,
  };
}

async function isLate(db: Queryable, taskId: string): Promise<boolean> {
  const { rows } = await db.query<{ late: boolean }>(
    `SELECT ${LATE_SQL} AS late FROM tasks t JOIN workspaces w ON w.id = t.workspace_id WHERE t.id = $1`,
    [taskId],
  );
  return rows[0]?.late ?? false;
}

/**
 * Moves a task to a new status. Rules are in core `canMove`: whoever it's for works it
 * and finishes it (or hands it in when it needs a check); whoever gave it (or a manager)
 * approves, sends back and cancels.
 */
export async function moveTask(db: Db, ctx: MemberContext, id: string, input: { status: TaskStatus; reason?: string | null }): Promise<TaskItem> {
  return withTransaction(db, async (tx) => {
    const row = await loadTask(tx, ctx, id, true);
    const from = row.status;
    const to = input.status;
    const check = canMove({ from, to, needsCheck: row.needs_check, ...roles(ctx, row) });
    if (!check.ok) throw forbidden(check.reason);
    if (from === to) {
      if (to === "waiting" && input.reason) await tx.query(`UPDATE tasks SET waiting_reason = $2 WHERE id = $1`, [id, input.reason]);
      return toTask(await loadTask(tx, ctx, id));
    }
    if (to === "waiting" && !input.reason) {
      throw new AppError(400, "VALIDATION_ERROR", "Say what it's waiting on", { reason: "Say what it's waiting on" });
    }

    const sets = ["status = $2", "waiting_reason = $3"];
    const values: unknown[] = [id, to, to === "waiting" ? input.reason : null];
    if (to === "doing") sets.push("started_at = coalesce(started_at, now())");
    if (to === "done") {
      // Done without a check, or approved by whoever gave it.
      values.push(ctx.userId);
      sets.push(
        "done_at = now()",
        `done_by = $${values.length}`,
        "completed_at = coalesce(completed_at, now())",
        "accepted_at = now()",
        `accepted_by = $${values.length}`,
      );
    } else if (to === "review") {
      sets.push("completed_at = coalesce(completed_at, now())");
    } else {
      // Back to work, or cancelled: it isn't finished.
      sets.push("done_at = NULL", "done_by = NULL", "accepted_at = NULL", "accepted_by = NULL");
      if (to !== "cancelled") sets.push("completed_at = NULL");
    }
    await tx.query(`UPDATE tasks SET ${sets.join(", ")} WHERE id = $1`, values);
    // A task approved straight from "waiting for a check" closes its latest hand-in.
    if (from === "review" && to === "done") {
      await tx.query(
        `UPDATE task_submissions SET decision = 'approved', decided_by = $2, decided_at = now()
          WHERE id = (SELECT id FROM task_submissions WHERE task_id = $1 AND decision IS NULL ORDER BY created_at DESC LIMIT 1)`,
        [id, ctx.userId],
      );
    }
    await taskEvent(tx, id, ctx.userId, "moved", { from, to, reason: input.reason ?? null });

    const base = { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, entityType: "task", entityId: id };
    if (to === "done") {
      const late = await isLate(tx, id);
      await logActivity(tx, {
        ...base,
        action: from === "review" ? "task.approved" : "task.done",
        meta: { title: row.title, eventId: row.event_id, dueDate: row.due_date, late, assigneeId: row.assignee_id },
      });
      await awardFinished(tx, ctx, row, late);
      // Approved: tell whoever did it. Ticked off: tell whoever gave it.
      if (from === "review") await taskAlert(tx, ctx, "task.approved", row, [row.assignee_id]);
      else await taskAlert(tx, ctx, "task.done", row, [row.created_by]);
    } else if (to === "waiting") {
      await logActivity(tx, { ...base, action: "task.stuck", meta: { title: row.title, reason: input.reason, assigneeId: row.assignee_id } });
      await taskAlert(tx, ctx, "task.stuck", row, [row.created_by], { reason: input.reason });
    } else if (to === "cancelled") {
      await logActivity(tx, { ...base, action: "task.cancelled", meta: { title: row.title, assigneeId: row.assignee_id } });
    }
    return toTask(await loadTask(tx, ctx, id));
  });
}

/** Hands the work in for a check: a note, a link or a photo. */
export async function submitTask(
  db: Db,
  ctx: MemberContext,
  id: string,
  input: { note?: string | null; link?: string | null; fileId?: string | null },
): Promise<TaskItem> {
  return withTransaction(db, async (tx) => {
    const row = await loadTask(tx, ctx, id, true);
    const r = roles(ctx, row);
    if (!r.isAssignee && !r.manages) throw forbidden("This task is for someone else");
    if (!row.needs_check) throw new AppError(409, "NO_CHECK_NEEDED", "This task doesn't need a check: tick it done");
    if (row.status === "done" || row.status === "cancelled") throw new AppError(409, "TASK_CLOSED", "This task is already closed");
    if (row.status === "review") throw new AppError(409, "ALREADY_HANDED_IN", "Already handed in, waiting for a check");
    if (input.fileId) await assertWorkspaceFile(tx, ctx.workspaceId, input.fileId);
    await tx.query(`INSERT INTO task_submissions (task_id, submitted_by, note, link, file_id) VALUES ($1, $2, $3, $4, $5)`, [
      id,
      ctx.userId,
      input.note ?? null,
      input.link ?? null,
      input.fileId ?? null,
    ]);
    if (input.fileId) {
      await tx.query(`INSERT INTO task_files (task_id, file_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [id, input.fileId, ctx.userId]);
    }
    await tx.query(
      `UPDATE tasks SET status = 'review', waiting_reason = NULL, started_at = coalesce(started_at, now()), completed_at = coalesce(completed_at, now()) WHERE id = $1`,
      [id],
    );
    await taskEvent(tx, id, ctx.userId, "submitted", { revision: row.revisions });
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: "task.submitted",
      entityType: "task",
      entityId: id,
      meta: { title: row.title, giverId: row.created_by, revision: row.revisions },
    });
    await taskAlert(tx, ctx, "task.submitted", row, [row.created_by]);
    return toTask(await loadTask(tx, ctx, id));
  });
}

/** Whoever gave it (or a manager) approves the handed-in work, or sends it back with what to change. */
export async function reviewTask(db: Db, ctx: MemberContext, id: string, input: { approve: boolean; reason?: string | null }): Promise<TaskItem> {
  return withTransaction(db, async (tx) => {
    const row = await loadTask(tx, ctx, id, true);
    const r = roles(ctx, row);
    if (!r.manages && !r.isGiver) throw forbidden("Only whoever gave this task can check it");
    if (row.status !== "review") throw new AppError(409, "NOT_HANDED_IN", "Nothing handed in to check yet");
    const late = await isLate(tx, id);
    const decided = await tx.query<{ id: string }>(
      `UPDATE task_submissions SET decision = $2, decided_by = $3, decided_at = now(), reason = $4
        WHERE id = (SELECT id FROM task_submissions WHERE task_id = $1 AND decision IS NULL ORDER BY created_at DESC LIMIT 1)
        RETURNING id`,
      [id, input.approve ? "approved" : "sent_back", ctx.userId, input.reason ?? null],
    );
    if (input.approve) {
      await tx.query(
        `UPDATE tasks SET status = 'done', done_at = now(), done_by = coalesce(assignee_id, $2), accepted_at = now(), accepted_by = $2 WHERE id = $1`,
        [id, ctx.userId],
      );
    } else {
      // Not finished after all: the clock runs until it's handed in again.
      await tx.query(`UPDATE tasks SET status = 'doing', completed_at = NULL, revisions = revisions + 1 WHERE id = $1`, [id]);
    }
    if (input.approve) await awardFinished(tx, ctx, row, late);
    else if (decided.rows[0]) await awardSentBack(tx, ctx, row, decided.rows[0].id);
    await taskEvent(tx, id, ctx.userId, input.approve ? "approved" : "sent_back", { reason: input.reason ?? null });
    await logActivity(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: input.approve ? "task.approved" : "task.sent_back",
      entityType: "task",
      entityId: id,
      meta: {
        title: row.title,
        assigneeId: row.assignee_id,
        reason: input.reason ?? null,
        late,
        firstTime: input.approve && row.revisions === 0,
      },
    });
    await taskAlert(tx, ctx, input.approve ? "task.approved" : "task.sent_back", row, [row.assignee_id], { reason: input.reason });
    return toTask(await loadTask(tx, ctx, id));
  });
}

/** Moves an open task to a later day, saying why. Counted as a moved deadline. */
export async function snoozeTask(db: Db, ctx: MemberContext, id: string, input: { to: string; reason?: string | null }): Promise<TaskItem> {
  return withTransaction(db, async (tx) => {
    const row = await loadTask(tx, ctx, id, true);
    const r = roles(ctx, row);
    if (!r.isAssignee && !r.manages && !r.isGiver) throw forbidden("This task is for someone else");
    if (row.status === "done" || row.status === "cancelled") throw new AppError(409, "TASK_CLOSED", "This task is already closed");
    if (row.due_date && input.to <= row.due_date) {
      throw new AppError(400, "VALIDATION_ERROR", "Pick a later day", { to: "Pick a later day than it's due" });
    }
    if (input.to < row.today) throw new AppError(400, "VALIDATION_ERROR", "Pick today or later", { to: "Pick today or later" });
    await tx.query(`UPDATE tasks SET due_date = $2, moved_count = moved_count + CASE WHEN due_date IS NULL THEN 0 ELSE 1 END WHERE id = $1`, [
      id,
      input.to,
    ]);
    await taskEvent(tx, id, ctx.userId, "deadline_moved", { from: row.due_date, to: input.to, reason: input.reason ?? null });
    if (row.due_date) {
      await awardMoved(tx, ctx, row);
      await logActivity(tx, {
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.userId,
        action: "task.deadline_moved",
        entityType: "task",
        entityId: id,
        meta: { title: row.title, from: row.due_date, to: input.to, reason: input.reason ?? null, assigneeId: row.assignee_id },
      });
    }
    return toTask(await loadTask(tx, ctx, id));
  });
}

// ---------------------------------------------------------------------------
// Steps, comments, files
// ---------------------------------------------------------------------------

export async function addStep(db: Db, ctx: MemberContext, taskId: string, title: string): Promise<TaskStep[]> {
  const row = await loadTask(db, ctx, taskId);
  const r = roles(ctx, row);
  // Whoever does it can break it into steps too.
  if (!r.manages && !r.isGiver && !r.isAssignee) throw forbidden("This task is for someone else");
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM task_steps WHERE task_id = $1`, [taskId]);
  if (rows[0]!.n >= 30) throw new AppError(400, "VALIDATION_ERROR", "Up to 30 steps on a task");
  await db.query(`INSERT INTO task_steps (task_id, title, position) VALUES ($1, $2, $3)`, [taskId, title, rows[0]!.n]);
  return listSteps(db, taskId);
}

export async function updateStep(db: Db, ctx: MemberContext, taskId: string, stepId: string, input: { title?: string; done?: boolean }): Promise<TaskStep[]> {
  const row = await loadTask(db, ctx, taskId);
  const r = roles(ctx, row);
  if (input.title !== undefined && !r.manages && !r.isGiver && !r.isAssignee) throw forbidden("This task is for someone else");
  if (input.done !== undefined && !r.manages && !r.isGiver && !r.isAssignee) throw forbidden("This task is for someone else");
  const { rowCount } = await db.query(
    `UPDATE task_steps SET title = coalesce($3, title),
            done_at = CASE WHEN $4::boolean IS NULL THEN done_at WHEN $4 THEN coalesce(done_at, now()) ELSE NULL END,
            done_by = CASE WHEN $4::boolean IS NULL THEN done_by WHEN $4 THEN $5::uuid ELSE NULL END
      WHERE id = $2 AND task_id = $1`,
    [taskId, stepId, input.title ?? null, input.done ?? null, ctx.userId],
  );
  if (!rowCount) throw notFound("This step");
  return listSteps(db, taskId);
}

export async function deleteStep(db: Db, ctx: MemberContext, taskId: string, stepId: string): Promise<TaskStep[]> {
  const row = await loadTask(db, ctx, taskId);
  const r = roles(ctx, row);
  if (!r.manages && !r.isGiver && !r.isAssignee) throw forbidden("This task is for someone else");
  await db.query(`DELETE FROM task_steps WHERE id = $2 AND task_id = $1`, [taskId, stepId]);
  return listSteps(db, taskId);
}

async function listSteps(db: Queryable, taskId: string): Promise<TaskStep[]> {
  const { rows } = await db.query<{ id: string; title: string; done_at: Date | null; done_by: string | null; done_by_name: string | null }>(
    `SELECT s.id, s.title, s.done_at, s.done_by, u.name AS done_by_name
       FROM task_steps s LEFT JOIN users u ON u.id = s.done_by
      WHERE s.task_id = $1 ORDER BY s.position, s.created_at`,
    [taskId],
  );
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    done: s.done_at !== null,
    doneAt: s.done_at?.toISOString() ?? null,
    doneBy: s.done_by ? { id: s.done_by, name: s.done_by_name } : null,
  }));
}

/** @Names in a comment that match someone in the business. */
async function mentionsIn(db: Queryable, workspaceId: string, body: string): Promise<string[]> {
  const tags = [...body.matchAll(/@([\p{L}][\p{L}.'-]*)/gu)].map((m) => m[1]!.toLowerCase());
  if (!tags.length) return [];
  const { rows } = await db.query<{ user_id: string; name: string | null }>(
    `SELECT m.user_id, u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 AND m.removed_at IS NULL`,
    [workspaceId],
  );
  return rows.filter((r) => r.name && tags.includes(r.name.split(/\s+/)[0]!.toLowerCase())).map((r) => r.user_id);
}

export async function addComment(db: Db, ctx: MemberContext, taskId: string, input: { body: string; fileId?: string | null }): Promise<void> {
  const row = await loadTask(db, ctx, taskId);
  if (input.fileId) await assertWorkspaceFile(db, ctx.workspaceId, input.fileId);
  const mentions = await mentionsIn(db, ctx.workspaceId, input.body);
  await db.query(`INSERT INTO task_comments (task_id, author_id, body, mentions, file_id) VALUES ($1, $2, $3, $4, $5)`, [
    taskId,
    ctx.userId,
    input.body,
    mentions,
    input.fileId ?? null,
  ]);
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: "task.commented",
    entityType: "task",
    entityId: taskId,
    meta: { title: row.title, mentions, assigneeId: row.assignee_id, giverId: row.created_by },
  });
  const task = { id: taskId, title: row.title };
  await taskAlert(db, ctx, "task.mentioned", task, mentions, { comment: input.body });
  await taskAlert(db, ctx, "task.commented", task, [row.assignee_id, row.created_by].filter((u) => !u || !mentions.includes(u)), { comment: input.body });
}

export async function deleteComment(db: Db, ctx: MemberContext, taskId: string, commentId: string): Promise<void> {
  await loadTask(db, ctx, taskId);
  const { rows } = await db.query<{ author_id: string }>(`SELECT author_id FROM task_comments WHERE id = $1 AND task_id = $2 AND deleted_at IS NULL`, [
    commentId,
    taskId,
  ]);
  if (!rows[0]) throw notFound("This comment");
  if (rows[0].author_id !== ctx.userId && !manages(ctx)) throw forbidden("Only whoever wrote it can remove this comment");
  await db.query(`UPDATE task_comments SET deleted_at = now() WHERE id = $1`, [commentId]);
}

export async function attachFile(db: Db, ctx: MemberContext, taskId: string, fileId: string): Promise<void> {
  const row = await loadTask(db, ctx, taskId);
  const r = roles(ctx, row);
  if (!r.manages && !r.isGiver && !r.isAssignee) throw forbidden("This task is for someone else");
  await assertWorkspaceFile(db, ctx.workspaceId, fileId);
  const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM task_files WHERE task_id = $1`, [taskId]);
  if (rows[0]!.n >= 20) throw new AppError(400, "VALIDATION_ERROR", "Up to 20 files on a task");
  await db.query(`INSERT INTO task_files (task_id, file_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [taskId, fileId, ctx.userId]);
  await taskEvent(db, taskId, ctx.userId, "file_added");
}

export async function detachFile(db: Db, ctx: MemberContext, taskId: string, fileId: string): Promise<void> {
  const row = await loadTask(db, ctx, taskId);
  const r = roles(ctx, row);
  const { rows } = await db.query<{ added_by: string | null }>(`SELECT added_by FROM task_files WHERE task_id = $1 AND file_id = $2`, [taskId, fileId]);
  if (!rows[0]) throw notFound("This file");
  if (!r.manages && !r.isGiver && rows[0].added_by !== ctx.userId) throw forbidden("Only whoever added it can remove this file");
  await db.query(`DELETE FROM task_files WHERE task_id = $1 AND file_id = $2`, [taskId, fileId]);
}

// ---------------------------------------------------------------------------
// One task, in full
// ---------------------------------------------------------------------------

type FileRow = { file_id: string | null; content_type: string | null; size_bytes: number | null };
const fileOf = (secret: Buffer, f: FileRow) =>
  f.file_id && f.content_type ? toUploaded(secret, { id: f.file_id, content_type: f.content_type, size_bytes: f.size_bytes ?? 0 }) : null;

export async function getTaskDetail(db: Queryable, secret: Buffer, ctx: MemberContext, id: string): Promise<TaskDetail> {
  const row = await loadTask(db, ctx, id);
  const r = roles(ctx, row);
  const [steps, comments, files, subs, events] = await Promise.all([
    listSteps(db, id),
    db.query<FileRow & { id: string; author_id: string; author_name: string | null; body: string; created_at: Date }>(
      `SELECT k.id, k.author_id, u.name AS author_name, k.body, k.created_at, k.file_id, f.content_type, f.size_bytes
         FROM task_comments k JOIN users u ON u.id = k.author_id LEFT JOIN files f ON f.id = k.file_id
        WHERE k.task_id = $1 AND k.deleted_at IS NULL ORDER BY k.created_at`,
      [id],
    ),
    db.query<FileRow & { added_by: string | null; added_by_name: string | null }>(
      `SELECT tf.file_id, f.content_type, f.size_bytes, tf.added_by, u.name AS added_by_name
         FROM task_files tf JOIN files f ON f.id = tf.file_id LEFT JOIN users u ON u.id = tf.added_by
        WHERE tf.task_id = $1 ORDER BY tf.created_at`,
      [id],
    ),
    db.query<
      FileRow & {
        id: string;
        submitted_by: string;
        by_name: string | null;
        note: string | null;
        link: string | null;
        created_at: Date;
        decision: "approved" | "sent_back" | null;
        decided_by: string | null;
        decided_name: string | null;
        decided_at: Date | null;
        reason: string | null;
      }
    >(
      `SELECT s.id, s.submitted_by, u.name AS by_name, s.note, s.link, s.created_at, s.decision, s.decided_by, d.name AS decided_name,
              s.decided_at, s.reason, s.file_id, f.content_type, f.size_bytes
         FROM task_submissions s JOIN users u ON u.id = s.submitted_by LEFT JOIN users d ON d.id = s.decided_by
         LEFT JOIN files f ON f.id = s.file_id
        WHERE s.task_id = $1 ORDER BY s.created_at DESC`,
      [id],
    ),
    db.query<{ id: string; actor_id: string | null; actor_name: string | null; action: string; meta: Record<string, unknown>; created_at: Date }>(
      `SELECT e.id::text, e.actor_id, u.name AS actor_name, e.action, e.meta, e.created_at
         FROM task_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.task_id = $1 ORDER BY e.created_at DESC, e.id DESC LIMIT 50`,
      [id],
    ),
  ]);
  const history: TaskHistoryItem[] = historyRows(events.rows);
  const boss = r.manages || r.isGiver;
  return {
    ...toTask(row),
    stepList: steps,
    commentList: comments.rows.map((k) => ({
      id: k.id,
      author: { id: k.author_id, name: k.author_name },
      body: k.body,
      file: fileOf(secret, k),
      createdAt: k.created_at.toISOString(),
      mine: k.author_id === ctx.userId,
    })),
    fileList: files.rows
      .map((f) => {
        const up = fileOf(secret, f);
        return up ? { ...up, addedBy: f.added_by ? { id: f.added_by, name: f.added_by_name } : null } : null;
      })
      .filter((f): f is NonNullable<typeof f> => f !== null),
    submissions: subs.rows.map((s) => ({
      id: s.id,
      by: { id: s.submitted_by, name: s.by_name },
      note: s.note,
      link: s.link,
      file: fileOf(secret, s),
      createdAt: s.created_at.toISOString(),
      decision: s.decision,
      decidedBy: s.decided_by ? { id: s.decided_by, name: s.decided_name } : null,
      decidedAt: s.decided_at?.toISOString() ?? null,
      reason: s.reason,
    })),
    history,
    can: {
      edit: boss,
      move: r.isAssignee || boss,
      review: boss && row.status === "review",
      cancel: boss,
      comment: true,
    },
  };
}

function historyRows(rows: { id: string; actor_id: string | null; actor_name: string | null; action: string; meta: Record<string, unknown>; created_at: Date }[]) {
  return rows.map((e) => ({
    id: e.id,
    actor: e.actor_id ? { id: e.actor_id, name: e.actor_name } : null,
    action: e.action,
    meta: e.meta ?? {},
    at: e.created_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// The owner's board
// ---------------------------------------------------------------------------

/** Each person's load today and the business's totals, in one look. */
export async function peopleBoard(db: Queryable, ctx: MemberContext): Promise<PeopleBoard> {
  if (!manages(ctx)) throw forbidden("Only the owner or a manager sees everyone's tasks");
  const { rows } = await db.query<{
    user_id: string;
    name: string | null;
    role: string;
    open: number;
    late: number;
    due_today: number;
    stuck: number;
    to_check: number;
    done_week: number;
    off_today: boolean;
    points: number;
    today: string;
  }>(
    `WITH today AS (SELECT (now() AT TIME ZONE timezone)::date AS d FROM workspaces WHERE id = $1)
     SELECT m.user_id, u.name, m.role, today.d::text AS today,
            count(t.id) FILTER (WHERE t.status NOT IN ('done', 'cancelled'))::int AS open,
            count(t.id) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND t.due_date < today.d)::int AS late,
            count(t.id) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND t.due_date = today.d)::int AS due_today,
            count(t.id) FILTER (WHERE t.status = 'waiting')::int AS stuck,
            count(t.id) FILTER (WHERE t.status = 'review')::int AS to_check,
            count(t.id) FILTER (WHERE t.status = 'done' AND (t.done_at AT TIME ZONE w.timezone)::date > today.d - 7)::int AS done_week,
            EXISTS (SELECT 1 FROM time_off o WHERE o.workspace_id = m.workspace_id AND o.user_id = m.user_id AND o.deleted_at IS NULL
                     AND today.d BETWEEN o.start_date AND o.end_date) AS off_today,
            (SELECT coalesce(sum(p.points), 0)::int FROM points_ledger p
              WHERE p.workspace_id = m.workspace_id AND p.user_id = m.user_id
                AND (p.at AT TIME ZONE w.timezone)::date >= date_trunc('month', today.d)::date) AS points
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       JOIN workspaces w ON w.id = m.workspace_id
       CROSS JOIN today
       LEFT JOIN tasks t ON t.workspace_id = m.workspace_id AND t.assignee_id = m.user_id AND t.deleted_at IS NULL
       LEFT JOIN events e ON e.id = t.event_id
      WHERE m.workspace_id = $1 AND m.removed_at IS NULL AND m.role <> 'accountant'
        AND (t.id IS NULL OR t.event_id IS NULL OR (e.status <> 'cancelled' AND e.deleted_at IS NULL))
      GROUP BY m.user_id, u.name, m.role, today.d, m.workspace_id, w.timezone
      ORDER BY count(t.id) FILTER (WHERE t.status NOT IN ('done', 'cancelled') AND t.due_date < today.d) DESC,
               count(t.id) FILTER (WHERE t.status NOT IN ('done', 'cancelled')) DESC, u.name`,
    [ctx.workspaceId],
  );
  const un = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM tasks t LEFT JOIN events e ON e.id = t.event_id
      WHERE t.workspace_id = $1 AND t.deleted_at IS NULL AND t.assignee_id IS NULL AND t.status NOT IN ('done', 'cancelled')
        AND (t.event_id IS NULL OR (e.status <> 'cancelled' AND e.deleted_at IS NULL))`,
    [ctx.workspaceId],
  );
  const people = rows.map((p) => ({
    user: { id: p.user_id, name: p.name },
    role: p.role,
    open: p.open,
    late: p.late,
    dueToday: p.due_today,
    stuck: p.stuck,
    toCheck: p.to_check,
    doneThisWeek: p.done_week,
    offToday: p.off_today,
    points: p.points,
  }));
  const sum = (k: "late" | "dueToday" | "stuck" | "toCheck" | "doneThisWeek") => people.reduce((a, p) => a + p[k], 0);
  return {
    today: rows[0]?.today ?? new Date().toISOString().slice(0, 10),
    people,
    totals: { late: sum("late"), dueToday: sum("dueToday"), toCheck: sum("toCheck"), stuck: sum("stuck"), doneThisWeek: sum("doneThisWeek"), unassigned: un.rows[0]!.n },
  };
}
