"use client";

import { formatClock, formatDate, formatDueDay, linksIn, TASK_STATUS_INFO, taskWhatsappText, timeAgo, whatsappLink } from "@wedding-yantra/core";
import {
  useApi,
  useMoveTask,
  useReviewTask,
  useSnoozeTask,
  useSubmitTask,
  useTask,
  useTaskComments,
  useTaskFiles,
  useTaskSteps,
  useUploadFile,
} from "@wedding-yantra/api-client/react";
import type { TaskDetail, TaskHistoryItem, TaskItem, UploadedFile } from "@wedding-yantra/types";
import {
  CalendarClock,
  Camera,
  Check,
  CircleDot,
  CirclePause,
  ExternalLink,
  FileText,
  History,
  Link2,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { CustomFieldList } from "@/components/app/custom-fields";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Avatar, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { prepareUpload } from "@/lib/images";
import { useBusinessDay } from "@/lib/today";
import { PriorityMark, StatusPill } from "./task-bits";

/** One task in full: where it stands, what to do next, and everything said and handed in. */
export function TaskView({ taskId, initial, onEdit, onClose }: { taskId: string; initial?: TaskItem; onEdit: (t: TaskItem) => void; onClose: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const detail = useTask(workspace.id, taskId);
  if (detail.isError) return <Notice tone="danger">{errorMessage(detail.error)}</Notice>;
  if (!detail.data) {
    return (
      <div className="space-y-3">
        {initial && <p className="font-display text-xl font-extrabold">{initial.title}</p>}
        <div className="flex justify-center py-10 text-brand">
          <Spinner />
        </div>
      </div>
    );
  }
  return <Loaded task={detail.data} onEdit={onEdit} onClose={onClose} />;
}

function Loaded({ task, onEdit, onClose }: { task: TaskDetail; onEdit: (t: TaskItem) => void; onClose: () => void }) {
  const { me } = useCurrentWorkspace();
  const today = useBusinessDay()();
  const mine = task.assignee?.id === me.user.id;
  const who = task.assignee ? (mine ? "You" : (task.assignee.name ?? "Team member")) : "Anyone on the event";
  const late = task.overdue;
  const links = linksIn(task.notes);
  const lastBack = task.submissions.find((s) => s.decision === "sent_back");
  const sentBackNow = task.status === "doing" && task.submissions[0]?.decision === "sent_back";

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={task.status} />
          <span className="text-sm"><PriorityMark priority={task.priority} always /></span>
          {task.needsCheck && (
            <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
              <ShieldCheck className="size-4" /> Checked before done
            </span>
          )}
          {task.tagLabel && <span className="rounded-md bg-cream px-2 text-xs font-semibold leading-6 text-ink-muted">{task.tagLabel}</span>}
        </div>
        <h3 className="font-display text-xl font-extrabold leading-snug">{task.title}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-muted">For</dt>
          <dd className="flex items-center gap-2 font-semibold">
            {task.assignee && <Avatar name={task.assignee.name} className="size-6 text-[10px]" />}
            {who}
          </dd>
          {task.dueDate && (
            <>
              <dt className="text-ink-muted">By</dt>
              <dd className={cn("font-semibold", late && "text-danger")}>
                {formatDueDay(task.dueDate, today)}
                {task.dueTime && `, ${formatClock(task.dueTime)}`}
                {task.movedCount > 0 && <span className="font-normal text-ink-muted"> · moved {task.movedCount === 1 ? "once" : `${task.movedCount} times`}</span>}
              </dd>
            </>
          )}
          {task.createdBy && task.createdBy.id !== task.assignee?.id && (
            <>
              <dt className="text-ink-muted">Given by</dt>
              <dd>{task.createdBy.id === me.user.id ? "You" : task.createdBy.name}</dd>
            </>
          )}
          {task.eventTitle && (
            <>
              <dt className="text-ink-muted">Event</dt>
              <dd>
                <Link href={`/app/events/${task.eventId}`} onClick={onClose} className="font-semibold text-brand-strong">
                  {task.eventTitle}
                </Link>
              </dd>
            </>
          )}
          {task.clientName && (
            <>
              <dt className="text-ink-muted">Client</dt>
              <dd>
                <Link href={`/app/clients/${task.clientId}`} onClick={onClose} className="font-semibold text-brand-strong">
                  {task.clientName}
                </Link>
              </dd>
            </>
          )}
          {task.estimateHours && (
            <>
              <dt className="text-ink-muted">Takes</dt>
              <dd>
                {task.estimateHours} hour{task.estimateHours === 1 ? "" : "s"}
              </dd>
            </>
          )}
          {task.revisions > 0 && (
            <>
              <dt className="text-ink-muted">Sent back</dt>
              <dd>{task.revisions === 1 ? "Once" : `${task.revisions} times`}</dd>
            </>
          )}
        </dl>
      </header>

      {task.status === "waiting" && task.waitingReason && <Notice tone="warning">Stuck: {task.waitingReason}</Notice>}
      {sentBackNow && lastBack?.reason && (
        <Notice tone="warning">
          Sent back{lastBack.decidedBy?.name ? ` by ${lastBack.decidedBy.name}` : ""}: {lastBack.reason}
        </Notice>
      )}

      <Actions task={task} />

      {task.notes && (
        <section>
          <p className="whitespace-pre-line text-[15px]">{task.notes}</p>
          {links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-cream px-3 text-sm font-semibold text-brand-strong">
                  <ExternalLink className="size-3.5" /> Open {l.host}
                </a>
              ))}
            </div>
          )}
        </section>
      )}
      <CustomFieldList entity="task" values={task.custom} />

      <Steps task={task} />
      <Files task={task} />
      {task.submissions.length > 0 && <HandIns task={task} />}
      <Comments task={task} />
      <HistoryList items={task.history} />

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {task.can.edit && (
          <Button variant="secondary" onClick={() => onEdit(task)}>
            <Pencil className="size-4" /> Change
          </Button>
        )}
        <a
          href={whatsappLink(
            taskWhatsappText({
              title: task.title,
              assigneeName: task.assignee?.name,
              priority: task.priority,
              dueDate: task.dueDate,
              dueTime: task.dueTime,
              eventTitle: task.eventTitle,
              notes: task.notes,
              steps: task.stepList.map((s) => ({ title: s.title, done: s.done })),
            }),
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold hover:bg-cream"
        >
          <MessageCircle className="size-4" /> Send on WhatsApp
        </a>
      </div>
      <p className="text-xs text-ink-subtle">
        Added {timeAgo(task.createdAt)}
        {task.createdBy?.name ? ` by ${task.createdBy.id === me.user.id ? "you" : task.createdBy.name}` : ""}
        {task.completedAt && task.status !== "done" && ` · Handed in ${timeAgo(task.completedAt)}`}
        {task.doneAt && task.status === "done" && ` · Done ${timeAgo(task.doneAt)}`}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What to do next
// ---------------------------------------------------------------------------

function Actions({ task }: { task: TaskDetail }) {
  const { workspace, me } = useCurrentWorkspace();
  const move = useMoveTask(workspace.id, task.id);
  const review = useReviewTask(workspace.id, task.id);
  const snooze = useSnoozeTask(workspace.id, task.id);
  const toast = useToast();
  const day = useBusinessDay();
  const [panel, setPanel] = useState<null | "stuck" | "handin" | "back" | "snooze">(null);
  const [reason, setReason] = useState("");
  const [snoozeTo, setSnoozeTo] = useState(day(1));
  const worker = task.assignee?.id === me.user.id || task.assignee === null;
  const boss = task.can.cancel;
  const active = task.status !== "done" && task.status !== "cancelled";
  const giverName = task.createdBy?.id === me.user.id ? "you" : (task.createdBy?.name ?? "whoever gave it");

  async function go(status: TaskDetail["status"], message: string, why?: string) {
    try {
      await move.mutateAsync({ status, reason: why });
      toast(message);
      setPanel(null);
      setReason("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }
  async function decide(approve: boolean) {
    try {
      await review.mutateAsync({ approve, reason: approve ? undefined : reason });
      toast(approve ? "Approved" : "Sent back");
      setPanel(null);
      setReason("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }
  async function moveDate(to: string) {
    try {
      await snooze.mutateAsync({ to, reason: reason || undefined });
      toast(`Moved to ${formatDate(to, { year: false })}`);
      setPanel(null);
      setReason("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const finishButton =
    task.needsCheck && !boss ? (
      <Button onClick={() => setPanel("handin")}>
        <Send className="size-4" /> Hand in for a check
      </Button>
    ) : (
      <Button onClick={() => go("done", "Done. Nicely done!")} loading={move.isPending && panel === null}>
        <Check className="size-4" strokeWidth={3} /> Mark done
      </Button>
    );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Checking handed-in work */}
        {task.status === "review" && boss && (
          <>
            <Button onClick={() => decide(true)} loading={review.isPending && panel !== "back"}>
              <ShieldCheck className="size-4" /> Approve
            </Button>
            <Button variant="secondary" onClick={() => setPanel(panel === "back" ? null : "back")}>
              <Undo2 className="size-4" /> Send back
            </Button>
          </>
        )}
        {task.status === "review" && !boss && worker && (
          <Notice>Handed in. Waiting for {giverName} to check it.</Notice>
        )}

        {/* Working it */}
        {worker && task.status === "open" && (
          <Button variant="secondary" onClick={() => go("doing", "Started")}>
            <CircleDot className="size-4" /> Start
          </Button>
        )}
        {(worker || boss) && active && task.status !== "review" && finishButton}
        {worker && (task.status === "open" || task.status === "doing") && (
          <Button variant="ghost" onClick={() => setPanel(panel === "stuck" ? null : "stuck")}>
            <CirclePause className="size-4" /> I&apos;m stuck
          </Button>
        )}
        {worker && task.status === "waiting" && (
          <Button variant="secondary" onClick={() => go("doing", "Back on it")}>
            <CircleDot className="size-4" /> Back to work
          </Button>
        )}
        {(worker || boss) && active && task.status !== "review" && (
          <Button variant="ghost" onClick={() => setPanel(panel === "snooze" ? null : "snooze")}>
            <CalendarClock className="size-4" /> Move date
          </Button>
        )}

        {/* Closed */}
        {task.status === "done" && (boss || !task.needsCheck) && (worker || boss) && (
          <Button variant="secondary" onClick={() => go("open", "Opened again")}>
            <RotateCcw className="size-4" /> Open again
          </Button>
        )}
        {task.status === "cancelled" && boss && (
          <Button variant="secondary" onClick={() => go("open", "Back on the list")}>
            <RotateCcw className="size-4" /> Bring it back
          </Button>
        )}
        {boss && active && (
          <Button variant="danger" onClick={() => go("cancelled", "Cancelled")}>
            <X className="size-4" /> Cancel task
          </Button>
        )}
      </div>

      {panel === "stuck" && (
        <form
          className="space-y-3 rounded-2xl bg-cream p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void go("waiting", "Marked as stuck", reason);
          }}
        >
          <TextField label="What is it waiting on?" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The couple's photo picks" autoFocus />
          <Button type="submit" variant="secondary" loading={move.isPending} disabled={!reason.trim()}>
            Mark as stuck
          </Button>
        </form>
      )}
      {panel === "back" && (
        <form
          className="space-y-3 rounded-2xl bg-cream p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void decide(false);
          }}
        >
          <TextAreaField label="What needs changing?" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cover page needs the couple's names" autoFocus />
          <Button type="submit" variant="secondary" loading={review.isPending} disabled={!reason.trim()}>
            Send it back
          </Button>
        </form>
      )}
      {panel === "snooze" && (
        <div className="space-y-3 rounded-2xl bg-cream p-4">
          <div className="flex flex-wrap gap-2">
            {[
              ["Tomorrow", 1],
              ["In 2 days", 2],
              ["Next week", 7],
            ].map(([label, n]) => (
              <button
                key={label as string}
                type="button"
                onClick={() => setSnoozeTo(day(n as number))}
                aria-pressed={snoozeTo === day(n as number)}
                className={cn(
                  "h-9 rounded-full px-3.5 text-sm font-bold",
                  snoozeTo === day(n as number) ? "bg-gradient-primary text-on-brand" : "border border-line bg-surface hover:bg-cream",
                )}
              >
                {label as string}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="New day" type="date" value={snoozeTo} onChange={(e) => setSnoozeTo(e.target.value)} />
            <TextField label="Why? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vendor closed today" />
          </div>
          <Button variant="secondary" onClick={() => moveDate(snoozeTo)} loading={snooze.isPending}>
            Move it
          </Button>
          {task.dueDate && <p className="text-xs text-ink-muted">Moving a date is noted on the task, so everyone knows.</p>}
        </div>
      )}
      {panel === "handin" && <HandInForm task={task} onDone={() => setPanel(null)} />}
    </section>
  );
}

function HandInForm({ task, onDone }: { task: TaskDetail; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const submit = useSubmitTask(workspace.id, task.id);
  const upload = useUploadFile(workspace.id);
  const toast = useToast();
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string>();

  async function send(e: FormEvent) {
    e.preventDefault();
    try {
      await submit.mutateAsync({ note, link, fileId: file?.id ?? null });
      toast("Handed in. They'll check it.");
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <form onSubmit={send} className="space-y-3 rounded-2xl bg-cream p-4">
      <p className="text-sm font-semibold">Hand in the work</p>
      <TextAreaField label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Done. Final files are in the drive." />
      <TextField label="Link (optional)" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" />
      <UploadButton label={file ? "Change photo" : "Add a photo or PDF"} onUploaded={setFile} busy={upload.isPending} />
      {file && <p className="text-sm text-success">Photo added.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" loading={submit.isPending}>
        <Send className="size-4" /> Hand in
      </Button>
    </form>
  );
}

/** Picks a photo or PDF, shrinks photos, uploads it. */
function UploadButton({ label, onUploaded, busy }: { label: string; onUploaded: (f: UploadedFile) => void; busy?: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const upload = useUploadFile(workspace.id);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            onUploaded(await upload.mutateAsync(await prepareUpload(f)));
          } catch (err) {
            toast(errorMessage(err), "error");
          }
        }}
      />
      <Button variant="secondary" size="sm" onClick={() => input.current?.click()} loading={busy || upload.isPending}>
        <Camera className="size-4" /> {label}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Steps, files, hand-ins, comments, history
// ---------------------------------------------------------------------------

function Steps({ task }: { task: TaskDetail }) {
  const { workspace } = useCurrentWorkspace();
  const steps = useTaskSteps(workspace.id, task.id);
  const toast = useToast();
  const [title, setTitle] = useState("");
  const canWork = task.can.move || task.can.edit;
  if (!task.stepList.length && !canWork) return null;
  const done = task.stepList.filter((s) => s.done).length;

  return (
    <section>
      <h4 className="mb-2 flex items-center justify-between text-sm font-bold">
        Steps
        {task.stepList.length > 0 && (
          <span className="font-semibold text-ink-muted tabular">
            {done} of {task.stepList.length}
          </span>
        )}
      </h4>
      {task.stepList.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {task.stepList.map((s) => (
            <li key={s.id} className="flex items-center gap-2 px-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={s.done}
                aria-label={s.title}
                disabled={!canWork}
                onClick={() => steps.update.mutate({ stepId: s.id, done: !s.done }, { onError: (err) => toast(errorMessage(err), "error") })}
                className="grid size-10 shrink-0 place-items-center"
              >
                <span className={cn("grid size-5 place-items-center rounded-md border-2", s.done ? "border-success bg-success text-on-brand" : "border-line-strong")}>
                  {s.done && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
              <span className={cn("min-w-0 flex-1 py-2 text-[15px]", s.done && "text-ink-muted line-through")}>{s.title}</span>
              {canWork && (
                <button
                  type="button"
                  onClick={() => steps.remove.mutate(s.id, { onError: (err) => toast(errorMessage(err), "error") })}
                  className="rounded-lg p-2 text-ink-subtle hover:bg-cream"
                  aria-label={`Remove ${s.title}`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWork && task.status !== "done" && task.status !== "cancelled" && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            try {
              await steps.add.mutateAsync(title.trim());
              setTitle("");
            } catch (err) {
              toast(errorMessage(err), "error");
            }
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a step"
            aria-label="New step"
            maxLength={160}
            className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] focus:border-sun-300 focus:outline-none"
          />
          <Button type="submit" variant="secondary" size="sm" className="h-10" loading={steps.add.isPending} disabled={!title.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
      )}
    </section>
  );
}

function FileThumb({ file, onRemove }: { file: UploadedFile; onRemove?: () => void }) {
  const api = useApi();
  const url = api.fileUrl(file.path);
  return (
    <span className="relative">
      <a href={url} target="_blank" rel="noopener noreferrer" className="grid size-20 place-items-center overflow-hidden rounded-xl border border-line bg-cream">
        {file.contentType === "application/pdf" ? (
          <FileText className="size-8 text-brand-strong" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived links; nothing for next/image to optimise
          <img src={url} alt="Attachment" className="size-full object-cover" />
        )}
      </a>
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-ink text-surface" aria-label="Remove file">
          <X className="size-3.5" />
        </button>
      )}
    </span>
  );
}

function Files({ task }: { task: TaskDetail }) {
  const { workspace, me } = useCurrentWorkspace();
  const files = useTaskFiles(workspace.id, task.id);
  const toast = useToast();
  const canAdd = task.can.move || task.can.edit;
  if (!task.fileList.length && !canAdd) return null;
  return (
    <section>
      <h4 className="mb-2 text-sm font-bold">Files</h4>
      <div className="flex flex-wrap items-center gap-3">
        {task.fileList.map((f) => (
          <FileThumb
            key={f.id}
            file={f}
            onRemove={task.can.edit || f.addedBy?.id === me.user.id ? () => files.detach.mutate(f.id, { onError: (err) => toast(errorMessage(err), "error") }) : undefined}
          />
        ))}
        {canAdd && (
          <UploadButton
            label="Add photo or PDF"
            onUploaded={(f) => files.attach.mutate(f.id, { onError: (err) => toast(errorMessage(err), "error") })}
            busy={files.attach.isPending}
          />
        )}
      </div>
    </section>
  );
}

function HandIns({ task }: { task: TaskDetail }) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-bold">Handed in</h4>
      <ol className="space-y-2">
        {task.submissions.map((s) => (
          <li key={s.id} className="rounded-2xl border border-line p-3 text-sm">
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {s.by.name ?? "Team member"} · {timeAgo(s.createdAt)}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-bold",
                  s.decision === "approved" ? "bg-success-soft text-success" : s.decision === "sent_back" ? "bg-warning-soft text-warning" : "bg-[#EEF2FF] text-[#4338CA]",
                )}
              >
                {s.decision === "approved" ? "Approved" : s.decision === "sent_back" ? "Sent back" : "Waiting for a check"}
              </span>
            </p>
            {s.note && <p className="mt-1 whitespace-pre-line">{s.note}</p>}
            {s.link && (
              <a href={s.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-brand-strong">
                <Link2 className="size-3.5" /> Open the work
              </a>
            )}
            {s.file && (
              <div className="mt-2">
                <FileThumb file={s.file} />
              </div>
            )}
            {s.decision === "sent_back" && s.reason && <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-warning">{s.reason}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Comments({ task }: { task: TaskDetail }) {
  const { workspace } = useCurrentWorkspace();
  const comments = useTaskComments(workspace.id, task.id);
  const toast = useToast();
  const [body, setBody] = useState("");
  const [file, setFile] = useState<UploadedFile | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      await comments.add.mutateAsync({ body: body.trim(), fileId: file?.id ?? null });
      setBody("");
      setFile(null);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <section>
      <h4 className="mb-2 text-sm font-bold">Comments</h4>
      {task.commentList.length > 0 && (
        <ul className="mb-3 space-y-3">
          {task.commentList.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.author.name} muted={!c.mine} className="size-8 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-ink-muted">
                  <span className="font-semibold text-ink">{c.mine ? "You" : c.author.name}</span> · {timeAgo(c.createdAt)}
                  {(c.mine || task.can.edit) && (
                    <button
                      type="button"
                      onClick={() => comments.remove.mutate(c.id, { onError: (err) => toast(errorMessage(err), "error") })}
                      className="ml-2 text-ink-subtle hover:text-danger"
                    >
                      Remove
                    </button>
                  )}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-[15px]">{c.body}</p>
                {c.file && (
                  <div className="mt-1.5">
                    <FileThumb file={c.file} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Write a comment. Use @Name to tell someone."
          aria-label="Comment"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-[15px] focus:border-sun-300 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" loading={comments.add.isPending} disabled={!body.trim()}>
            <Send className="size-4" /> Send
          </Button>
          <UploadButton label={file ? "Photo added" : "Photo"} onUploaded={setFile} />
          {file && (
            <button type="button" className="text-sm text-ink-muted" onClick={() => setFile(null)}>
              Remove photo
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function historyText(h: TaskHistoryItem): string {
  const m = h.meta;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  switch (h.action) {
    case "created":
      return "added this task";
    case "moved": {
      const to = s(m.to) as keyof typeof TASK_STATUS_INFO | null;
      const label = to ? TASK_STATUS_INFO[to]?.label.toLowerCase() : "a new stage";
      return `moved it to ${label}${s(m.reason) ? `: ${s(m.reason)}` : ""}`;
    }
    case "submitted":
      return "handed it in";
    case "approved":
      return "approved it";
    case "sent_back":
      return `sent it back${s(m.reason) ? `: ${s(m.reason)}` : ""}`;
    case "deadline_moved":
      return `moved the date${s(m.to) ? ` to ${formatDate(s(m.to)!, { year: false })}` : ""}${s(m.reason) ? `: ${s(m.reason)}` : ""}`;
    case "due_changed":
      return s(m.to) ? `set the date to ${formatDate(s(m.to)!, { year: false })}` : "took the date off";
    case "reassigned":
      return "changed who does it";
    case "file_added":
      return "added a file";
    case "edited":
      return "changed the details";
    default:
      return h.action.replace(/[._]/g, " ");
  }
}

function HistoryList({ items }: { items: TaskHistoryItem[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const shown = open ? items : items.slice(0, 3);
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-bold">
        <History className="size-4 text-ink-muted" /> What happened
      </h4>
      <ol className="space-y-1.5 text-sm">
        {shown.map((h) => (
          <li key={h.id} className="flex gap-2">
            <span className="text-ink-muted tabular">{timeAgo(h.at)}</span>
            <span>
              <span className="font-semibold">{h.actor?.name ?? "Someone"}</span> {historyText(h)}
            </span>
          </li>
        ))}
      </ol>
      {items.length > 3 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-1.5 text-sm font-semibold text-brand-strong">
          {open ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}

