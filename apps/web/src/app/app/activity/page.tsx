"use client";

import { activityText, can, daysBetween, formatClock, formatDate, todayIn } from "@wedding-yantra/core";
import { useActivity, useTeam } from "@wedding-yantra/api-client/react";
import type { ActivityItem } from "@wedding-yantra/types";
import { History, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

const LINKS: Record<NonNullable<ActivityItem["link"]>["kind"], (id: string | null) => string> = {
  event: (id) => `/app/events/${id}`,
  lead: (id) => `/app/leads/${id}`,
  bill: (id) => `/app/bills/${id}`,
  quote: (id) => `/app/quotes/${id}`,
  client: (id) => `/app/clients/${id}`,
  team: () => "/app/team",
  expenses: () => "/app/money?view=expenses",
  tasks: () => "/app/tasks?view=team",
};

/** Who did what, and when. For owners and managers. */
export default function ActivityPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "team.review");
  const [person, setPerson] = useState<string | undefined>(undefined);
  const team = useTeam(allowed ? workspace.id : null);
  const feed = useActivity(workspace.id, person, allowed);

  if (!allowed) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Activity" />
        <Card>
          <EmptyState icon={Lock} title="The activity log is for the owner and managers">
            It shows who did what across the business.
          </EmptyState>
        </Card>
      </>
    );
  }

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const members = team.data?.members ?? [];

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Activity" subtitle="Who did what, newest first." />
      {members.length > 1 && (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Whose activity">
          {[{ userId: undefined as string | undefined, name: "Everyone" }, ...members.map((m) => ({ userId: m.userId as string | undefined, name: m.isYou ? "You" : (m.name ?? m.phone) }))].map(
            (m) => (
              <button
                key={m.userId ?? "all"}
                role="tab"
                aria-selected={person === m.userId}
                onClick={() => setPerson(m.userId)}
                className={cn(
                  "h-10 shrink-0 rounded-full px-4 text-sm font-bold transition",
                  person === m.userId ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
                )}
              >
                {m.name}
              </button>
            ),
          )}
        </div>
      )}

      {feed.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {feed.isError && <Notice tone="danger">{errorMessage(feed.error)}</Notice>}
      {feed.data && items.length === 0 && (
        <Card>
          <EmptyState icon={History} title="Nothing yet">
            As the team adds enquiries, ticks off tasks and records money, it shows up here.
          </EmptyState>
        </Card>
      )}
      {items.length > 0 && <Feed items={items} timezone={workspace.timezone} />}
      {feed.hasNextPage && (
        <Button variant="secondary" className="mt-4" onClick={() => void feed.fetchNextPage()} loading={feed.isFetchingNextPage}>
          Show older
        </Button>
      )}
    </>
  );
}

/** A local calendar day and time in the business's time zone, from an ISO timestamp. */
function localParts(iso: string, timeZone: string) {
  const d = new Date(iso);
  const date = todayIn(timeZone, d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, time };
}

function Feed({ items, timezone }: { items: ActivityItem[]; timezone: string }) {
  const today = todayIn(timezone);
  const days = new Map<string, { item: ActivityItem; time: string }[]>();
  for (const item of items) {
    const { date, time } = localParts(item.at, timezone);
    days.set(date, [...(days.get(date) ?? []), { item, time }]);
  }
  const heading = (date: string) => {
    const diff = daysBetween(date, today);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return formatDate(date, { year: date.slice(0, 4) !== today.slice(0, 4) });
  };

  return (
    <div className="space-y-6">
      {[...days.entries()].map(([date, list]) => (
        <section key={date}>
          <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">{heading(date)}</h2>
          <Card className="divide-y divide-line overflow-hidden">
            {list.map(({ item, time }) => (
              <Row key={item.id} item={item} time={time} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function Row({ item, time }: { item: ActivityItem; time: string }) {
  const text = activityText({ ...item, actorName: item.actor?.name ?? null });
  // Notes and calls carry what was said; show it under the sentence.
  const quote = item.action === "lead.note" || item.action === "lead.call" ? item.detail : null;
  const href = item.link && (item.link.id || !["event", "lead", "bill", "quote", "client"].includes(item.link.kind)) ? LINKS[item.link.kind](item.link.id) : null;
  const body = (
    <>
      {item.actor ? (
        <Avatar name={item.actor.name} className="mt-0.5 size-8 text-[11px]" />
      ) : (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-cream text-brand-strong">
          <Sparkles className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1 text-[15px] leading-snug">
        {item.actor && <span className="font-bold">{item.actor.name ?? "Someone"} </span>}
        <span className={cn(item.late && "text-danger")}>{text}</span>
        {quote && <span className="mt-1 block truncate text-sm text-ink-muted">“{quote}”</span>}
      </span>
      <span className="shrink-0 text-xs font-semibold tabular text-ink-subtle">{formatClock(time)}</span>
    </>
  );
  return href ? (
    <Link href={href} className="flex items-start gap-3 px-4 py-3 hover:bg-cream sm:px-5">
      {body}
    </Link>
  ) : (
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">{body}</div>
  );
}
