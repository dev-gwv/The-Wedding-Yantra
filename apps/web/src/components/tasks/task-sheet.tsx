"use client";

import { can, describeRepeat, eventScope, formatDate, timeAgo, WEEKDAY_NAMES, weekdayOf, type RepeatFrequency } from "@wedding-yantra/core";
import {
  useCreateTask,
  useCreateTaskRepeat,
  useDeleteTask,
  useEvents,
  useSetTaskDone,
  useStopTaskRepeat,
  useTeam,
  useUpdateTask,
} from "@wedding-yantra/api-client/react";
import { taskInput, taskRepeatInput, updateTaskInput, type TaskItem } from "@wedding-yantra/types";
import { Flag, Repeat } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { eventDates } from "@/components/bookings/event-card";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";
import { canEditTask, canTick } from "./task-row";

/** Add a task, or open one to change it or tick it off. */
export function TaskSheet({
  open,
  onClose,
  task,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  task?: TaskItem;
  /** Opened from an event: the task is for it */
  eventId?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={task ? "Task" : "New task"}>
      {open && <TaskForm task={task} eventId={eventId} onDone={onClose} />}
    </Sheet>
  );
}

function TaskForm({ task, eventId, onDone }: { task?: TaskItem; eventId?: string; onDone: () => void }) {
  const { workspace, me } = useCurrentWorkspace();
  const manage = can(workspace.role, "tasks.manage");
  const editable = !task || canEditTask(task, workspace.role, me.user.id);
  const day = useBusinessDay();
  const today = day();
  const create = useCreateTask(workspace.id);
  const update = useUpdateTask(workspace.id);
  const remove = useDeleteTask(workspace.id);
  const setDone = useSetTaskDone(workspace.id);
  const team = useTeam(manage && editable ? workspace.id : null);
  // Coming events to hang the task on (freelancers get only theirs).
  const events = useEvents(workspace.id, { from: today, status: "confirmed" }, editable && !eventId && eventScope(workspace.role) !== "none");
  const toast = useToast();

  const [title, setTitle] = useState(task?.title ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(task?.dueTime ?? "");
  const [assigneeId, setAssigneeId] = useState(task ? (task.assignee?.id ?? "") : me.user.id);
  const [forEvent, setForEvent] = useState(task?.eventId ?? eventId ?? "");
  const [urgent, setUrgent] = useState(task?.priority === "high");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Repeating: only for new tasks that aren't for an event.
  const createRepeat = useCreateTaskRepeat(workspace.id);
  const stopRepeat = useStopTaskRepeat(workspace.id);
  const [repeat, setRepeat] = useState<"none" | RepeatFrequency>("none");
  const [weekdays, setWeekdays] = useState<number[]>(() => [weekdayOf(today)]);
  const [monthDay, setMonthDay] = useState(() => String(Number(today.slice(8, 10))));

  const quickDays: [string, number][] = [
    ["Today", 0],
    ["Tomorrow", 1],
    ["In a week", 7],
  ];

  async function submitRepeat() {
    const fields = {
      title,
      notes,
      dueTime,
      priority: urgent ? ("high" as const) : ("normal" as const),
      frequency: repeat as RepeatFrequency,
      weekdays,
      monthDay: repeat === "monthly" ? monthDay : null,
      startDate: dueDate || today,
      ...(manage ? { assigneeId: assigneeId || null } : {}),
    };
    const check = validate(taskRepeatInput, fields);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const made = await createRepeat.mutateAsync(fields);
      toast(`${made.label}: ${made.title}`);
      onDone();
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (repeat !== "none") return submitRepeat();
    const fields = {
      title,
      notes,
      dueDate,
      dueTime,
      priority: urgent ? ("high" as const) : ("normal" as const),
      eventId: forEvent || null,
      // Only owners and managers choose who does it; everyone else adds for themselves.
      ...(manage ? { assigneeId: assigneeId || null } : {}),
    };
    const check = task ? validate(updateTaskInput, fields) : validate(taskInput, fields);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (task) {
        await update.mutateAsync({ ...fields, id: task.id });
        toast("Task saved");
      } else {
        await create.mutateAsync(fields);
        const forSomeoneElse = manage && assigneeId !== me.user.id;
        toast(forSomeoneElse ? "Task given" : "Task added");
      }
      onDone();
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  async function tick(done: boolean) {
    if (!task) return;
    try {
      await setDone.mutateAsync({ id: task.id, done });
      toast(done ? "Done" : "Opened again");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function deleteIt() {
    if (!task) return;
    try {
      await remove.mutateAsync(task.id);
      toast("Task removed");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  // The task's own event stays choosable even when it's in the past.
  const eventOptions = events.data ?? [];
  const missingEvent = task?.eventId && !eventOptions.some((e) => e.id === task.eventId) ? { id: task.eventId, title: task.eventTitle ?? "Event" } : null;
  const members = team.data?.members ?? [];
  const eventChosen = !!(forEvent || eventId);
  const canRepeat = !task && !eventChosen;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {task && (
        <p className="text-sm text-ink-muted">
          {task.done && task.doneAt
            ? `Done${task.doneBy?.name ? ` by ${task.doneBy.name}` : ""} ${timeAgo(task.doneAt)}.`
            : task.createdBy && task.createdBy.id !== me.user.id
              ? `Added by ${task.createdBy.name ?? "the team"}${task.fromChecklist ? " from the event checklist" : ""}.`
              : task.fromChecklist
                ? "From the event checklist."
                : null}
        </p>
      )}
      {task && canTick(task, workspace.role, me.user.id) && (
        <Button variant="secondary" size="lg" onClick={() => tick(!task.done)} loading={setDone.isPending} className={cn(!task.done && "text-success")}>
          {task.done ? "Open it again" : "Mark done"}
        </Button>
      )}

      <fieldset disabled={!editable} className="space-y-4">
        <TextField
          label="What needs doing"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="Call the florist about the mandap flowers"
          autoFocus={!task}
          maxLength={160}
        />

        <div>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label={repeat === "none" ? "By when" : "Starting"}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              error={errors.dueDate ?? errors.startDate}
            />
            <TextField label="Time (optional)" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} error={errors.dueTime} disabled={!dueDate && repeat === "none"} />
          </div>
          {editable && repeat === "none" && (
            <div className="mt-2 flex flex-wrap gap-2">
              {quickDays.map(([label, days]) => {
                const value = day(days);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setDueDate(value)}
                    aria-pressed={dueDate === value}
                    className={cn(
                      "h-9 rounded-full px-3.5 text-sm font-bold transition",
                      dueDate === value ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
              {dueDate && (
                <button
                  type="button"
                  onClick={() => {
                    setDueDate("");
                    setDueTime("");
                  }}
                  className="h-9 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-cream"
                >
                  No date
                </button>
              )}
            </div>
          )}
        </div>

        {canRepeat && (
          <div>
            <p className="mb-2 text-sm font-semibold text-ink">Repeat</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["none", "Doesn't repeat"],
                  ["daily", "Every day"],
                  ["weekly", "Every week"],
                  ["monthly", "Every month"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRepeat(key)}
                  aria-pressed={repeat === key}
                  className={cn(
                    "h-9 rounded-full px-3.5 text-sm font-bold transition",
                    repeat === key ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {repeat === "weekly" && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="On these days">
                {WEEKDAY_NAMES.map((name, i) => {
                  const d = i + 1;
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== d) : [...w, d]))}
                      className={cn(
                        "h-10 w-12 rounded-xl border text-sm font-bold",
                        on ? "border-sun-300 bg-cream text-brand-strong" : "border-line text-ink-muted hover:bg-cream",
                      )}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            )}
            {repeat === "monthly" && (
              <TextField
                label="On day of the month"
                inputMode="numeric"
                value={monthDay}
                onChange={(e) => setMonthDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                error={errors.monthDay}
                hint="Short months use their last day."
                className="mt-3 max-w-48"
              />
            )}
            {errors.weekdays && <p className="mt-1.5 text-sm text-danger">{errors.weekdays}</p>}
            {repeat !== "none" && (
              <p className="mt-2 text-sm text-ink-muted">
                {describeRepeat({ frequency: repeat, weekdays, monthDay: Number(monthDay) || null })}. A new task appears on each of these days.
              </p>
            )}
          </div>
        )}

        {manage && editable && (
          <SelectField label="Who does it" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} error={errors.assigneeId}>
            {(eventChosen || (task && !task.assignee)) && <option value="">Anyone on the event</option>}
            {members.length === 0 && assigneeId && <option value={assigneeId}>{task?.assignee?.name ?? me.user.name ?? "You"}</option>}
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name ?? m.phone}
                {m.isYou ? " (you)" : ""}
              </option>
            ))}
          </SelectField>
        )}
        {!manage && task?.assignee && task.assignee.id !== me.user.id && (
          <p className="text-sm text-ink-muted">For {task.assignee.name ?? "a team member"}.</p>
        )}

        {!eventId && (eventOptions.length > 0 || missingEvent) && (
          <SelectField label="For an event" value={forEvent} onChange={(e) => setForEvent(e.target.value)} error={errors.eventId}>
            <option value="">Not for an event</option>
            {missingEvent && <option value={missingEvent.id}>{missingEvent.title}</option>}
            {eventOptions.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
                {ev.startDate ? ` · ${eventDates(ev)}` : ""}
              </option>
            ))}
          </SelectField>
        )}
        {!editable && task?.eventTitle && !eventId && <p className="text-sm text-ink-muted">For {task.eventTitle}.</p>}

        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line px-4 py-3 has-[:checked]:border-sun-300 has-[:checked]:bg-cream">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="size-5 accent-brand" />
          <Flag className="size-4 text-brand-strong" />
          <span className="font-semibold">Urgent</span>
          <span className="text-sm text-ink-muted">Shows first on the day</span>
        </label>

        <TextAreaField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} maxLength={1000} />
      </fieldset>

      {task?.repeat && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-cream px-4 py-3 text-sm">
          <Repeat className="size-4 text-brand-strong" />
          <span className="flex-1">
            {task.repeat.active ? `Repeats: ${task.repeat.label.toLowerCase()}.` : `Stopped repeating (${task.repeat.label.toLowerCase()}).`}
          </span>
          {task.repeat.active && (manage || task.assignee?.id === me.user.id || task.createdBy?.id === me.user.id) && (
            <Button
              variant="ghost"
              size="sm"
              loading={stopRepeat.isPending}
              onClick={async () => {
                try {
                  await stopRepeat.mutateAsync(task.repeat!.id);
                  toast("No more new copies. This one stays.");
                  onDone();
                } catch (err) {
                  toast(errorMessage(err), "error");
                }
              }}
            >
              Stop repeating
            </Button>
          )}
        </div>
      )}
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      {!editable && task && (
        <Notice>
          Only the owner, a manager or {task.createdBy?.name ?? "whoever added it"} can change this task.
          {task.dueDate && ` It's due ${formatDate(task.dueDate)}.`}
        </Notice>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="submit" size="lg" loading={create.isPending || update.isPending || createRepeat.isPending} className="sm:w-auto sm:px-8">
            {task ? "Save" : repeat !== "none" ? "Add repeating task" : manage && assigneeId && assigneeId !== me.user.id ? "Give task" : "Add task"}
          </Button>
          {task && !confirmRemove && (
            <Button variant="danger" onClick={() => setConfirmRemove(true)}>
              Remove
            </Button>
          )}
          {task && confirmRemove && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-muted">Remove this task?</span>
              <Button variant="destructive" size="sm" onClick={deleteIt} loading={remove.isPending}>
                Remove
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
                Keep it
              </Button>
            </span>
          )}
        </div>
      )}
    </form>
  );
}
