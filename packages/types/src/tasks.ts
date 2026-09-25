import { z } from "zod";
import { optionalText } from "./common.js";
import type { EventSummary } from "./bookings.js";
import type { PersonRef } from "./sales.js";

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const TASK_PRIORITIES = ["normal", "high"] as const;
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
  done: boolean;
  doneAt: string | null;
  doneBy: PersonRef | null;
  /** Still open and its day has passed */
  overdue: boolean;
  /** Made from the event checklist */
  fromChecklist: boolean;
  createdBy: PersonRef | null;
  createdAt: string;
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
  notes: optionalText(1000),
  eventId: z.uuid().nullable().optional(),
  /** Who does it. Leave empty for yourself. */
  assigneeId: z.uuid().nullable().optional(),
  dueDate: date,
  dueTime: time,
  priority: z.enum(TASK_PRIORITIES).optional(),
};

export const taskInput = z.object(taskFields);
export type TaskInput = z.input<typeof taskInput>;
export const updateTaskInput = z.object(taskFields).partial();
export type UpdateTaskInput = z.input<typeof updateTaskInput>;
export const setTaskDoneInput = z.object({ done: z.boolean() });

export const taskListQuery = z.object({
  /** mine: given to me; team: everyone's (owners and managers) */
  scope: z.enum(["mine", "team"]).optional(),
  status: z.enum(["open", "done"]).optional(),
  eventId: z.uuid().optional(),
  assigneeId: z.uuid().optional(),
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
