"use client";

import { can, daysBetween, eventScope } from "@wedding-yantra/core";
import { useDeliverables } from "@wedding-yantra/api-client/react";
import type { Deliverable } from "@wedding-yantra/types";
import { Lock, Package } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { DeliverableSheet } from "@/components/deliverables/deliverable-sheet";
import { DeliverableRow } from "@/components/deliverables/deliverables";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";

type View = "open" | "delivered";

/** Everything owed to clients across events: what's late, what's due this week, what's next. */
export default function DeliverablesPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = eventScope(workspace.role) !== "none";
  const everyone = can(workspace.role, "events.manage");
  const [view, setView] = useState<View>("open");
  const [mine, setMine] = useState(!everyone);
  const list = useDeliverables(workspace.id, { status: view, ...(mine && { mine: "true" as const }) }, allowed);
  const [open, setOpen] = useState<Deliverable | null>(null);
  const today = useBusinessDay()();

  if (!allowed) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Deliverables" />
        <Card>
          <EmptyState icon={Lock} title="Your role doesn't include events" />
        </Card>
      </>
    );
  }

  const items = list.data ?? [];
  const groups: [string, Deliverable[]][] =
    view === "delivered"
      ? [["Recently delivered", items]]
      : [
          ["Late", items.filter((d) => d.late)],
          ["This week", items.filter((d) => !d.late && d.dueDate && daysBetween(today, d.dueDate) <= 6)],
          ["Later", items.filter((d) => d.dueDate && daysBetween(today, d.dueDate) > 6)],
          ["No date yet", items.filter((d) => !d.dueDate)],
        ];

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Deliverables" subtitle="What you owe clients after (and before) their events, and when." />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["open", "delivered"] as const).map((v) => (
          <Chip key={v} on={view === v} onClick={() => setView(v)}>
            {v === "open" ? "To deliver" : "Delivered"}
          </Chip>
        ))}
        {everyone && (
          <Chip on={mine} onClick={() => setMine((m) => !m)}>
            Only mine
          </Chip>
        )}
      </div>

      {list.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {list.isError && <Notice tone="danger">{errorMessage(list.error)}</Notice>}
      {list.isSuccess && items.length === 0 && (
        <Card>
          <EmptyState icon={Package} title={view === "open" ? "Nothing waiting" : "Nothing delivered yet"}>
            {view === "open" ? "Add what you'll hand over from each event's page: photos, films, albums, hampers." : "Delivered items show up here."}
          </EmptyState>
        </Card>
      )}
      <div className="space-y-6">
        {groups
          .filter(([, g]) => g.length > 0)
          .map(([label, g]) => (
            <section key={label}>
              <h2 className={cn("mb-2 font-display text-lg font-extrabold", label === "Late" && "text-danger")}>
                {label} <span className="text-base font-semibold text-ink-muted tabular">· {g.length}</span>
              </h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">
                  {g.map((d) => (
                    <DeliverableRow key={d.id} d={d} showEvent onOpen={setOpen} />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
      </div>
      <DeliverableSheet open={open !== null} onClose={() => setOpen(null)} deliverable={open ?? undefined} />
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn("rounded-full px-4 py-2 text-sm font-bold", on ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100")}
    >
      {children}
    </button>
  );
}
