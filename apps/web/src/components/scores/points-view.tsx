"use client";

import { can, formatDate, POINT_RULE_INFO } from "@wedding-yantra/core";
import { useLeaderboard, useLedger, usePointRules, useRecognise } from "@wedding-yantra/api-client/react";
import type { Leaderboard, LeaderboardRow, Ledger as LedgerData } from "@wedding-yantra/types";
import { Award, Crown, Flame, Medal, Settings2, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { Avatar, Card, EmptyState, Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/** Band colours, from the top band down. */
const BAND_TONES = ["bg-success-soft text-success", "bg-sun-50 text-brand-strong", "bg-warning-soft text-warning", "bg-cream text-ink-muted"];

function bandTone(board: Leaderboard, band: string) {
  const i = board.bands.findIndex((b) => b.name === band);
  return BAND_TONES[Math.min(i === -1 ? 3 : i, 3)]!;
}

const first = (name: string | null) => name?.split(/\s+/)[0] ?? "Team member";

export function PointsView({ month, current }: { month: string; current: boolean }) {
  const { workspace, me } = useCurrentWorkspace();
  const board = useLeaderboard(workspace.id, month);
  const [person, setPerson] = useState<LeaderboardRow | null>(null);
  const manager = can(workspace.role, "team.review");

  if (board.isPending) {
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner />
      </div>
    );
  }
  if (board.isError) return <Notice tone="danger">{errorMessage(board.error)}</Notice>;
  const b = board.data;
  const ranked = b.rows.filter((r) => r.rank !== null);
  const unranked = b.rows.filter((r) => r.rank === null);
  const open = (r: LeaderboardRow) => (manager || r.user.id === me.user.id ? setPerson(r) : undefined);

  return (
    <div className="space-y-6">
      {/* Owners and managers who earned nothing themselves don't need an empty card. */}
      {b.me && (b.me.rank !== null || !manager) && <MyCard board={b} onOpen={() => setPerson(b.me)} />}

      {ranked.length === 0 ? (
        <Card>
          <EmptyState icon={Trophy} title="No points yet this month">
            {current ? "Points come in as tasks given to people are finished. On time and first time earn more." : "Nobody earned points this month."}
          </EmptyState>
        </Card>
      ) : (
        <>
          {ranked.length >= 2 && <Podium board={b} onOpen={open} />}
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {ranked.map((r) => (
                <li key={r.user.id}>
                  <button
                    type="button"
                    onClick={() => open(r)}
                    className={cn("flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5", (manager || r.user.id === me.user.id) && "hover:bg-cream", r.user.id === me.user.id && "bg-sun-50/60")}
                  >
                    <span className="w-7 shrink-0 text-center font-display text-lg font-extrabold text-ink-muted tabular">{r.rank}</span>
                    <Avatar name={r.user.name} className="size-9 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">
                        {r.user.name ?? "Team member"}
                        {r.user.id === me.user.id && <span className="font-semibold text-ink-muted"> (you)</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                        <span className={cn("rounded-full px-2 py-0.5 font-bold", bandTone(b, r.band))}>{r.band}</span>
                        <span>{r.tasksDone} done</span>
                        {r.onTime !== null && <span>{r.onTime}% on time</span>}
                        {r.lateNow > 0 && <span className="font-semibold text-danger">{r.lateNow} late now</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-display text-xl font-extrabold tabular">{r.points}</span>
                      <span className="block text-[11px] font-semibold text-ink-muted">points</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      {unranked.length > 0 && (
        <p className="text-sm text-ink-muted">
          Not ranked: {unranked.map((r) => r.user.name ?? "a team member").join(", ")}. {unranked[0]!.notRanked}.
        </p>
      )}
      <HowPointsWork penaltiesOn={b.penaltiesOn} />
      <LedgerSheet person={person} month={month} onClose={() => setPerson(null)} />
    </div>
  );
}

/** Your own month: points, band, rank, the gap to the next band, and one thing to do. */
function MyCard({ board, onOpen }: { board: Leaderboard; onOpen: () => void }) {
  const me = board.me!;
  const ranked = board.rows.filter((r) => r.rank !== null).length;
  const bandMin = board.bands.find((x) => x.name === me.band)?.min ?? 0;
  const nextMin = me.nextBand ? (board.bands.find((x) => x.name === me.nextBand)?.min ?? bandMin) : bandMin;
  const progress = me.nextBand ? Math.max(4, Math.min(100, Math.round(((me.points - bandMin) / Math.max(1, nextMin - bandMin)) * 100))) : 100;
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-primary p-5 text-on-brand sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold opacity-90">Your points this month</p>
            <p className="font-display text-5xl font-extrabold leading-none tabular">{me.points}</p>
          </div>
          <div className="text-right">
            {me.rank !== null ? (
              <>
                <p className="font-display text-3xl font-extrabold leading-none">#{me.rank}</p>
                <p className="text-sm font-semibold opacity-90">of {ranked}</p>
              </>
            ) : (
              <p className="max-w-[9rem] text-sm font-semibold opacity-90">Not ranked yet</p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs font-bold">
            <span>{me.band}</span>
            {me.nextBand && (
              <span>
                {me.gap} to {me.nextBand}
              </span>
            )}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/30">
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 p-4 sm:px-6">
        <Sparkles className="size-5 shrink-0 text-brand" />
        <p className="min-w-[12rem] flex-1 text-[15px] font-semibold">{me.coaching}</p>
        <Button size="sm" variant="secondary" onClick={onOpen}>
          How I earned them
        </Button>
      </div>
    </Card>
  );
}

function Podium({ board, onOpen }: { board: Leaderboard; onOpen: (r: LeaderboardRow) => void }) {
  const top = board.rows.filter((r) => r.rank !== null).slice(0, 3);
  // Second, first, third: the winner in the middle.
  const order = [top[1], top[0], top[2]].filter(Boolean) as LeaderboardRow[];
  const style = (r: LeaderboardRow) =>
    r === top[0]
      ? { h: "h-28 sm:h-32", tone: "bg-gradient-primary text-on-brand", icon: Crown }
      : r === top[1]
        ? { h: "h-20 sm:h-24", tone: "bg-sun-100 text-brand-deep", icon: Medal }
        : { h: "h-14 sm:h-16", tone: "bg-cream text-ink", icon: Award };
  return (
    <Card className="px-3 pb-0 pt-5 sm:px-6">
      <div className="flex items-end justify-center gap-2 sm:gap-4">
        {order.map((r) => {
          const s = style(r);
          const Icon = s.icon;
          return (
            <button key={r.user.id} type="button" onClick={() => onOpen(r)} className="flex w-full max-w-[9.5rem] flex-col items-center text-center">
              <Icon className={cn("mb-1 size-5", r === top[0] ? "text-brand" : "text-ink-muted")} />
              <Avatar name={r.user.name} className={cn("text-xs", r === top[0] ? "size-14" : "size-11")} />
              <span className="mt-1.5 w-full truncate text-sm font-bold">{first(r.user.name)}</span>
              <span className="mb-2 text-xs font-semibold text-ink-muted tabular">{r.points} points</span>
              <span className={cn("grid w-full place-items-center rounded-t-2xl font-display text-2xl font-extrabold", s.h, s.tone)}>{r.rank}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function HowPointsWork({ penaltiesOn }: { penaltiesOn: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const [open, setOpen] = useState(false);
  const rules = usePointRules(workspace.id);
  const owner = can(workspace.role, "workspace.update");
  return (
    <section>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-sm font-bold text-brand-strong hover:text-brand-deep">
          {open ? "Hide how points work" : "How points work"}
        </button>
        {owner && (
          <Link href="/app/settings/points" className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted hover:text-ink">
            <Settings2 className="size-4" /> Change the points
          </Link>
        )}
      </div>
      {open && rules.data && (
        <Card className="mt-3 p-5 text-sm">
          <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {rules.data.rules
              .filter((r) => r.enabled && r.points !== 0 && (!r.penalty || penaltiesOn))
              .map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3">
                  <span>{r.label}</span>
                  <span className={cn("shrink-0 font-bold tabular", r.points < 0 ? "text-danger" : "text-success")}>
                    {r.points > 0 ? "+" : ""}
                    {r.points}
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-4 text-ink-muted">
            Only tasks someone else gave you count, and each is paid once. {penaltiesOn ? "Penalties are on in this business." : "There are no penalties in this business."}
          </p>
        </Card>
      )}
    </section>
  );
}

/** How someone earned their points this month, and (for managers) a way to recognise them. */
function LedgerSheet({ person, month, onClose }: { person: LeaderboardRow | null; month: string; onClose: () => void }) {
  const { workspace, me } = useCurrentWorkspace();
  const mine = person?.user.id === me.user.id;
  const ledger = useLedger(workspace.id, month, mine ? null : (person?.user.id ?? null), person !== null);
  const recognise = useRecognise(workspace.id);
  const toast = useToast();
  const [note, setNote] = useState("");
  const [giving, setGiving] = useState(false);
  const canRecognise = can(workspace.role, "team.review") && !mine;

  function close() {
    setNote("");
    setGiving(false);
    onClose();
  }

  return (
    <Sheet open={person !== null} onClose={close} title={mine ? "Your points" : `${first(person?.user.name ?? null)}'s points`} description={person ? `${person.points} points · ${person.band}` : undefined}>
      {ledger.isPending ? (
        <div className="flex justify-center py-10 text-brand">
          <Spinner />
        </div>
      ) : ledger.isError ? (
        <Notice tone="danger">{errorMessage(ledger.error)}</Notice>
      ) : ledger.data.entries.length === 0 ? (
        <p className="py-4 text-sm text-ink-muted">No points yet this month.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-line">
          {groupByTask(ledger.data.entries).map((g) => (
            <li key={g.key} className="flex items-start gap-3 px-1 py-3">
              <span
                className={cn(
                  "grid h-8 min-w-12 shrink-0 place-items-center rounded-xl px-2 text-sm font-extrabold tabular",
                  g.total < 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
                )}
              >
                {g.total > 0 ? "+" : ""}
                {g.total}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="flex items-center gap-1.5 font-semibold">
                  {g.streak && <Flame className="size-4 text-brand" />}
                  {g.title}
                </span>
                <span className="block text-ink-muted">{g.parts}</span>
                {g.note && <span className="block text-ink-muted">“{g.note}”</span>}
                <span className="block text-xs text-ink-subtle">
                  {formatDate(g.at.slice(0, 10))}
                  {g.by && ` · from ${first(g.by)}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {canRecognise && person && (
        <div className="mt-4 border-t border-line pt-4">
          {giving ? (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                recognise.mutate(
                  { userId: person.user.id, note },
                  {
                    onSuccess: (r) => {
                      toast(`+${r.points} points for ${first(person.user.name)}`);
                      setNote("");
                      setGiving(false);
                    },
                    onError: (err) => toast(errorMessage(err), "error"),
                  },
                );
              }}
              className="space-y-3"
            >
              <TextAreaField label="What was great?" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Handled the Sharma family brilliantly on the wedding day" autoFocus />
              <div className="flex gap-2">
                <Button type="submit" loading={recognise.isPending} disabled={note.trim().length < 3}>
                  <Award className="size-4" /> Recognise
                </Button>
                <Button variant="ghost" onClick={() => setGiving(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="secondary" onClick={() => setGiving(true)}>
              <Award className="size-4" /> Recognise {first(person.user.name)}
            </Button>
          )}
          <p className="mt-2 text-xs text-ink-muted">They get the points and an alert with your note.</p>
        </div>
      )}
    </Sheet>
  );
}

type Entry = LedgerData["entries"][number];

/** A task's points on one line ("Album layout: urgent 12 · on time 2 · first time 3"). */
function groupByTask(entries: Entry[]) {
  const groups: { key: string; title: string; parts: string; total: number; at: string; note: string | null; by: string | null; streak: boolean }[] = [];
  const byTask = new Map<string, Entry[]>();
  for (const e of entries) {
    if (e.task && (e.rule.startsWith("done_") || e.rule === "on_time" || e.rule === "first_time" || e.rule === "late")) {
      byTask.set(e.task.id, [...(byTask.get(e.task.id) ?? []), e]);
    } else {
      groups.push({
        key: e.id,
        title: e.task ? e.task.title : (POINT_RULE_INFO[e.rule]?.label ?? e.label),
        parts: e.task ? (POINT_RULE_INFO[e.rule]?.label ?? e.label) : "",
        total: e.points,
        at: e.at,
        note: e.note,
        by: e.rule === "recognition" ? (e.by?.name ?? null) : null,
        streak: e.rule === "streak_7",
      });
    }
  }
  for (const [taskId, list] of byTask) {
    groups.push({
      key: taskId,
      title: list[0]!.task!.title,
      parts: list.map((e) => `${SHORT[e.rule] ?? e.label} ${e.points > 0 ? "+" : ""}${e.points}`).join(" · "),
      total: list.reduce((a, e) => a + e.points, 0),
      at: list.map((e) => e.at).sort().reverse()[0]!,
      note: null,
      by: null,
      streak: false,
    });
  }
  return groups.sort((a, b) => b.at.localeCompare(a.at));
}

const SHORT: Record<string, string> = {
  done_urgent: "Urgent task",
  done_high: "High-priority task",
  done_normal: "Task",
  done_low: "Low-priority task",
  on_time: "on time",
  first_time: "first time",
  late: "late",
};
