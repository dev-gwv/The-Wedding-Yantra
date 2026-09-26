import { REPEAT_FREQUENCIES, TASK_PRIORITY_LEVELS, TASK_STATUSES, type CustomValues, type RepeatFrequency, type TaskStatus } from "@wedding-yantra/core";
import { customValuesInput } from "./custom.js";
import type { UploadedFile } from "./expenses.js";
import { z } from "zod";
import { optionalText } from "./common.js";
import type { EventSummary } from "./bookings.js";
import type { PersonRef } from "./sales.js";

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const TASK_PRIORITIES = TASK_PRIORITY_LEVELS;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  eventId: string | null;
  eventTitle: string | null;
  assignee: PersonRef | null;
  dueDate: string | null;
  dueTime: string | null;
  priority: TaskPriority;
  /** Where it stands: to do, doing, stuck, waiting for a check, done, cancelled */
  status: TaskStatus;
  done: boolean;
  doneAt: string | null;
  doneBy: PersonRef | null;
  /** Still open and its day has passed */
  overdue: boolean;
  /** A key from the business's task tags */
  tag: string | null;
  tagLabel: string | null;
  clientId: string | null;
  clientName: string | null;
  startDate: string | null;
  estimateHours: number | null;
  /** Whoever gave it checks the work before it counts as done */
  needsCheck: boolean;
  /** Why it's stuck */
  waitingReason: string | null;
  /** When the work was finished (ticked, or first handed in), whatever happened after */
  completedAt: string | null;
  acceptedAt: string | null;
  /** Times it was sent back */
  revisions: number;
  /** Times its date was pushed later */
  movedCount: number;
  steps: { done: number; total: number };
  comments: number;
  files: number;
  /** The latest work handed in, for "Handed in · Open" on the card */
  lastSubmission: { at: string; link: string | null; decision: "approved" | "sent_back" | null } | null;
  custom: CustomValues;
  /** Made from the event checklist */
  fromChecklist: boolean;
  /** Made by a repeating rule: "Every Mon, Wed and Fri" */
  repeat: { id: string; label: string; active: boolean } | null;
  createdBy: PersonRef | null;
  createdAt: string;
}

/** A rule that makes a task on each of its days. */
export interface TaskRepeat {
  id: string;
  title: string;
  notes: string | null;
  assignee: PersonRef;
  priority: TaskPriority;
  dueTime: string | null;
  frequency: RepeatFrequency;
  weekdays: number[];
  monthDay: number | null;
  startDate: string;
  /** "Every Mon, Wed and Fri" */
  label: string;
  /** The next day it makes a task, today included */
  nextDate: string | null;
  createdBy: PersonRef | null;
}

const time = z
  .union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 18:30")])
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));
const date = z
  .union([z.literal(""), z.iso.date("Pick a valid date")])
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

const taskFields = {
  title: z.string().trim().min(2, "Say what needs doing").max(160),
  notes: optionalText(4000),
  tag: z.string().trim().max(40).nullable().optional(),
  clientId: z.uuid().nullable().optional(),
  startDate: date,
  estimateHours: z.coerce.number().positive("More than zero").max(999).nullable().optional(),
  needsCheck: z.boolean().optional(),
  custom: customValuesInput,
  eventId: z.uuid().nullable().optional(),
  /** Who does it. Leave empty for yourself. */
  assigneeId: z.uuid().nullable().optional(),
  dueDate: date,
  dueTime: time,
  priority: z.enum(TASK_PRIORITIES).optional(),
};

export const taskInput = z.object({
  ...taskFields,
  /** Small steps to add with the task */
  steps: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
});
export type TaskInput = z.input<typeof taskInput>;
export const updateTaskInput = z.object(taskFields).partial();
export type UpdateTaskInput = z.input<typeof updateTaskInput>;
export const setTaskDoneInput = z.object({ done: z.boolean() });

export const taskRepeatInput = z
  .object({
    title: z.string().trim().min(2, "Say what needs doing").max(160),
    notes: optionalText(1000),
    /** Who does it. Leave empty for yourself. */
    assigneeId: z.uuid().nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueTime: time,
    frequency: z.enum(REPEAT_FREQUENCIES, "How often?"),
    weekdays: z.array(z.coerce.number().int().min(1).max(7)).max(7).optional(),
    monthDay: z.coerce.number().int().min(1, "Pick a day of the month").max(31, "Pick a day of the month").nullable().optional(),
    /** YYYY-MM-DD; default today */
    startDate: z.iso.date("Pick a valid date").optional(),
  })
  .refine((r) => r.frequency !== "weekly" || (r.weekdays?.length ?? 0) > 0, { message: "Pick at least one day", path: ["weekdays"] })
  .refine((r) => r.frequency !== "monthly" || !!r.monthDay, { message: "Pick a day of the month", path: ["monthDay"] });
export type TaskRepeatInput = z.input<typeof taskRepeatInput>;

export const TASK_DUE_FILTERS = ["overdue", "today", "week", "none"] as const;
export type TaskDueFilter = (typeof TASK_DUE_FILTERS)[number];

export const taskListQuery = z.object({
  /** mine: given to me; team: everyone's (owners and managers); given: ones I gave others */
  scope: z.enum(["mine", "team", "given"]).optional(),
  /** open: still to finish (any active status); done: finished */
  status: z.enum(["open", "done"]).optional(),
  /** One exact status */
  state: z.enum(TASK_STATUSES).optional(),
  eventId: z.uuid().optional(),
  clientId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
  priority: z.enum(TASK_PRIORITY_LEVELS).optional(),
  tag: z.string().max(40).optional(),
  due: z.enum(TASK_DUE_FILTERS).optional(),
  q: z.string().trim().max(80).optional(),
});
export type TaskListQuery = z.input<typeof taskListQuery>;

// ---------------------------------------------------------------------------
// The checklist every event starts with
// ---------------------------------------------------------------------------

export const CHECKLIST_WHEN = ["before", "on_day", "after"] as const;
export type ChecklistWhen = (typeof CHECKLIST_WHEN)[number];
export const CHECKLIST_WHEN_LABELS: Record<ChecklistWhen, string> = {
  before: "Before the event",
  on_day: "On the day",
  after: "After the event",
};

export interface ChecklistItem {
  id: string;
  title: string;
  when: ChecklistWhen;
  /** Days before (or after) the event. Zero for on the day. */
  days: number;
}

export const saveChecklistInput = z.object({
  items: z
    .array(
      z.object({
        id: z.uuid().optional(),
        title: z.string().trim().min(2, "Name the step").max(160),
        when: z.enum(CHECKLIST_WHEN),
        days: z.coerce.number().int().min(0, "Zero or more").max(365, "At most a year"),
      }),
    )
    .max(60, "Keep it to 60 steps"),
});
export type SaveChecklistInput = z.input<typeof saveChecklistInput>;

// ---------------------------------------------------------------------------
// Who works an event
// ---------------------------------------------------------------------------

export interface TeamMember {
  userId: string;
  name: string | null;
  /** e.g. "Lead artist", "Sound engineer" */
  roleNote: string | null;
  /** When to reach, e.g. 16:30 */
  callTime: string | null;
}

export const saveEventTeamInput = z.object({
  members: z
    .array(z.object({ userId: z.uuid(), roleNote: optionalText(60), callTime: time }))
    .max(50),
});
export type SaveEventTeamInput = z.input<typeof saveEventTeamInput>;

// ---------------------------------------------------------------------------
// My Day
// ---------------------------------------------------------------------------

/** Everything one person should look at today. */
export interface MyDay {
  today: string;
  overdue: TaskItem[];
  dueToday: TaskItem[];
  /** The next seven days */
  upcoming: TaskItem[];
  /** Events you're on the team for, today and the next seven days */
  events: (EventSummary & { callTime: string | null; roleNote: string | null })[];
}

// ---------------------------------------------------------------------------
// Days off
// ---------------------------------------------------------------------------

export interface TimeOff {
  id: string;
  user: PersonRef;
  startDate: string;
  endDate: string;
  note: string | null;
  createdBy: PersonRef | null;
}

export const timeOffInput = z
  .object({
    /** Whose days off. Leave empty for yourself; owners and managers can choose anyone. */
    userId: z.uuid().optional(),
    startDate: z.iso.date("Pick the first day"),
    endDate: z.iso.date("Pick the last day"),
    note: optionalText(200),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "The last day can't be before the first", path: ["endDate"] });
export type TimeOffInput = z.input<typeof timeOffInput>;

export const timeOffQuery = z.object({
  /** Days off that end on or after this day */
  from: z.iso.date().optional(),
  /** Days off that start on or before this day */
  to: z.iso.date().optional(),
  userId: z.uuid().optional(),
});
export type TimeOffQuery = z.input<typeof timeOffQuery>;

// ---------------------------------------------------------------------------
// Delegation: moving, handing in, checking, steps, comments, files, history
// ---------------------------------------------------------------------------

export const moveTaskInput = z
  .object({
    status: z.enum(TASK_STATUSES),
    /** Why it's stuck (for "waiting") */
    reason: optionalText(300),
  })
  .refine((v) => v.status !== "waiting" || !!v.reason, { message: "Say what it's waiting on", path: ["reason"] });
export type MoveTaskInput = z.input<typeof moveTaskInput>;

const link = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === "" || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(v), "Paste the whole link, starting with https://")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const submitTaskInput = z
  .object({
    note: optionalText(1000),
    link,
    fileId: z.uuid().nullable().optional(),
  })
  .refine((v) => !!(v.note || v.link || v.fileId), { message: "Add a note, a link or a photo of the work", path: ["note"] });
export type SubmitTaskInput = z.input<typeof submitTaskInput>;

export const reviewTaskInput = z
  .object({ approve: z.boolean(), reason: optionalText(500) })
  .refine((v) => v.approve || !!v.reason, { message: "Say what needs changing", path: ["reason"] });
export type ReviewTaskInput = z.input<typeof reviewTaskInput>;

export const snoozeTaskInput = z.object({ to: z.iso.date("Pick the new day"), reason: optionalText(300) });
export type SnoozeTaskInput = z.input<typeof snoozeTaskInput>;

export interface TaskStep {
  id: string;
  title: string;
  done: boolean;
  doneBy: PersonRef | null;
  doneAt: string | null;
}
export const stepInput = z.object({ title: z.string().trim().min(1, "Name the step").max(160) });
export const updateStepInput = z.object({ title: z.string().trim().min(1).max(160).optional(), done: z.boolean().optional() });
export type UpdateStepInput = z.input<typeof updateStepInput>;

export interface TaskComment {
  id: string;
  author: PersonRef;
  body: string;
  file: UploadedFile | null;
  createdAt: string;
  mine: boolean;
}
export const commentInput = z.object({
  body: z.string().trim().min(1, "Write something").max(2000),
  fileId: z.uuid().nullable().optional(),
});
export type CommentInput = z.input<typeof commentInput>;

export const attachFileInput = z.object({ fileId: z.uuid() });

export interface TaskSubmission {
  id: string;
  by: PersonRef;
  note: string | null;
  link: string | null;
  file: UploadedFile | null;
  createdAt: string;
  decision: "approved" | "sent_back" | null;
  decidedBy: PersonRef | null;
  decidedAt: string | null;
  reason: string | null;
}

export interface TaskHistoryItem {
  id: string;
  actor: PersonRef | null;
  action: string;
  meta: Record<string, unknown>;
  at: string;
}

/** A task opened on its own: everything on it. */
export interface TaskDetail extends TaskItem {
  stepList: TaskStep[];
  commentList: TaskComment[];
  fileList: (UploadedFile & { addedBy: PersonRef | null })[];
  submissions: TaskSubmission[];
  history: TaskHistoryItem[];
  /** What the person looking can do */
  can: { edit: boolean; move: boolean; review: boolean; cancel: boolean; comment: boolean };
}

/** The owner's board: each person's load, and the business's totals. */
export interface PeopleBoard {
  today: string;
  people: {
    user: PersonRef;
    role: string;
    open: number;
    late: number;
    dueToday: number;
    stuck: number;
    toCheck: number;
    doneThisWeek: number;
    offToday: boolean;
  }[];
  totals: { late: number; dueToday: number; toCheck: number; stuck: number; doneThisWeek: number; unassigned: number };
}
