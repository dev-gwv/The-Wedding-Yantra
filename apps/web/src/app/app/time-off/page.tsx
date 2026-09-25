"use client";

import { can, daysBetween, formatDateRange } from "@wedding-yantra/core";
import { useAddTimeOff, useRemoveTimeOff, useTeam, useTimeOff } from "@wedding-yantra/api-client/react";
import { timeOffInput, type TimeOff } from "@wedding-yantra/types";
import { CalendarOff, Lock, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Avatar, Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";

/** Days people are off, so nobody is put on an event they can't work. */
export default function TimeOffPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "tasks.work");
  const manage = can(workspace.role, "tasks.manage");
  const day = useBusinessDay();
  const today = day();
  const list = useTimeOff(workspace.id, { from: day(-30) }, allowed);
  const [adding, setAdding] = useState(false);

  if (!allowed) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Days off" />
        <Card>
          <EmptyState icon={Lock} title="Days off aren't part of your role">
            They&apos;re for the people who work events.
          </EmptyState>
        </Card>
      </>
    );
  }

  const all = list.data ?? [];
  const coming = all.filter((o) => o.endDate >= today);
  const past = all.filter((o) => o.endDate < today).reverse();

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title="Days off"
        subtitle={manage ? "Who's away, so you don't put them on an event those days." : "Tell the owner which days you can't work."}
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" strokeWidth={2.5} /> Add days off
          </Button>
        }
      />
      {list.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {list.isError && <Notice tone="danger">{errorMessage(list.error)}</Notice>}
      {list.data &&
        (all.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarOff} title="Nobody is off">
              {manage ? "When someone will be away, add their days here. The event team picker will warn you." : "Add the days you'll be away, well before."}
            </EmptyState>
          </Card>
        ) : (
          <div className="space-y-6">
            {coming.length > 0 && <OffList title="Now and coming up" items={coming} today={today} />}
            {past.length > 0 && <OffList title="Last 30 days" items={past} today={today} muted />}
          </div>
        ))}
      <Sheet open={adding} onClose={() => setAdding(false)} title="Days off">
        {adding && <AddForm onDone={() => setAdding(false)} />}
      </Sheet>
    </>
  );
}

function OffList({ title, items, today, muted }: { title: string; items: TimeOff[]; today: string; muted?: boolean }) {
  const { workspace, me } = useCurrentWorkspace();
  const remove = useRemoveTimeOff(workspace.id);
  const toast = useToast();
  const manage = can(workspace.role, "tasks.manage");

  async function removeIt(o: TimeOff) {
    try {
      await remove.mutateAsync(o.id);
      toast("Days off removed");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">{title}</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {items.map((o) => {
          const days = daysBetween(o.startDate, o.endDate) + 1;
          const now = o.startDate <= today && o.endDate >= today;
          return (
            <div key={o.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={o.user.name} muted={muted} className="size-9 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {o.user.id === me.user.id ? "You" : (o.user.name ?? "Team member")}
                  {now && <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-xs font-bold text-brand-strong">Off today</span>}
                </p>
                <p className="text-sm text-ink-muted">
                  {formatDateRange(o.startDate, o.endDate, today.slice(0, 4))} · {days} day{days === 1 ? "" : "s"}
                  {o.note && ` · ${o.note}`}
                </p>
              </div>
              {(manage || o.user.id === me.user.id) && (
                <button
                  type="button"
                  onClick={() => removeIt(o)}
                  className="shrink-0 rounded-lg p-2 text-ink-muted hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remove days off ${formatDateRange(o.startDate, o.endDate)}`}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const { workspace, me } = useCurrentWorkspace();
  const manage = can(workspace.role, "tasks.manage");
  const team = useTeam(manage ? workspace.id : null);
  const add = useAddTimeOff(workspace.id);
  const toast = useToast();
  const today = useBusinessDay()();
  const [userId, setUserId] = useState(me.user.id);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fields = { ...(userId !== me.user.id ? { userId } : {}), startDate, endDate, note };
    const check = validate(timeOffInput, fields);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      await add.mutateAsync(fields);
      toast("Days off added");
      onDone();
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  const members = (team.data?.members ?? []).filter((m) => m.role !== "accountant");
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {manage && members.length > 1 && (
        <SelectField label="Who" value={userId} onChange={(e) => setUserId(e.target.value)} error={errors.userId}>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name ?? m.phone}
              {m.isYou ? " (you)" : ""}
            </option>
          ))}
        </SelectField>
      )}
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="From"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            if (endDate < e.target.value) setEndDate(e.target.value);
          }}
          error={errors.startDate}
        />
        <TextField label="To" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} error={errors.endDate} />
      </div>
      <TextField label="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} placeholder="Family function" maxLength={200} />
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={add.isPending}>
        Add days off
      </Button>
    </form>
  );
}
