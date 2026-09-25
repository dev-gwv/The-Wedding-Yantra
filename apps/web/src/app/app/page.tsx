"use client";

import { can, firstName, formatMoney, greeting, type Role } from "@wedding-yantra/core";
import { useHome } from "@wedding-yantra/api-client/react";
import { UNIT_LABELS, type HomeSummary } from "@wedding-yantra/types";
import { Check, ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { SETUP_LINKS } from "@/lib/links";

export default function HomePage() {
  const { me, workspace } = useCurrentWorkspace();
  const home = useHome(workspace.id);
  // Signed-in screens only render in the browser, so the viewer's own clock is used.
  const hello = greeting(new Date().getHours());

  return (
    <>
      <header className="mb-8">
        <p className="text-sm text-ink-muted">{workspace.name}</p>
        <h1 className="mt-1 font-display text-3xl font-medium tracking-tight">
          {hello}
          {me.user.name ? `, ${firstName(me.user.name)}` : ""}
        </h1>
      </header>

      {home.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {home.isError && (
        <Notice tone="danger">
          {errorMessage(home.error)}{" "}
          <button className="font-medium underline" onClick={() => void home.refetch()}>
            Try again
          </button>
        </Notice>
      )}
      {home.data && <HomeContent home={home.data} role={workspace.role} />}
    </>
  );
}

function HomeContent({ home, role }: { home: HomeSummary; role: Role }) {
  // Setup steps are the owner's and manager's job; others never see a to-do they can't do.
  const showSetup = can(role, "workspace.update") && home.setupDone < home.setupTotal;

  return (
    <div className="space-y-6">
      {showSetup && <SetupCard home={home} />}

      <Card>
        <EmptyState icon={Inbox} title="Nothing needs you today">
          New enquiries, follow-ups, events and payments due will show up here, so you know what to do first
          each morning.
        </EmptyState>
      </Card>

      <StarterPack home={home} />
    </div>
  );
}

function SetupCard({ home }: { home: HomeSummary }) {
  const percent = Math.round((home.setupDone / home.setupTotal) * 100);
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Get set up</h2>
          <span className="text-sm text-ink-muted tabular">
            {home.setupDone} of {home.setupTotal} done
          </span>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {home.setup.map((step) => {
          const href = SETUP_LINKS[step.key];
          const body = (
            <>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border",
                  step.done ? "border-success bg-success text-on-brand" : "border-line-strong",
                )}
              >
                {step.done && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", step.done && "text-ink-muted line-through")}>
                  {step.title}
                </span>
                {!step.done && <span className="mt-0.5 block text-sm text-ink-muted">{step.description}</span>}
              </span>
              {!step.done && href && <ChevronRight className="size-4 shrink-0 text-ink-subtle" />}
            </>
          );
          return (
            <li key={step.key}>
              {!step.done && href ? (
                <Link href={href} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-muted">
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-5 py-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** What we prepared for this kind of business. Details stay folded until asked for. */
function StarterPack({ home }: { home: HomeSummary }) {
  const [open, setOpen] = useState(false);
  const pack = home.starterPack;
  const counts = [
    { label: "Services", value: pack.services.length },
    { label: "Sales stages", value: pack.pipelineStages.length },
    { label: "Checklist", value: pack.checklist.length },
  ];

  return (
    <Card className="p-5">
      <h2 className="font-semibold">Ready for your {home.businessTypeName.toLowerCase()} business</h2>
      <p className="mt-1 text-sm text-ink-muted">
        A starting set you&apos;ll use for quotes, sales and events. Every item can be changed.
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {counts.map((c) => (
          <div key={c.label} className="rounded-md bg-surface-muted px-3 py-3">
            <dt className="text-xs text-ink-muted">{c.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular">{c.value}</dd>
          </div>
        ))}
      </dl>

      {open && (
        <div className="mt-5 space-y-5 text-sm">
          <section>
            <h3 className="font-medium">Services</h3>
            <ul className="mt-2 divide-y divide-line rounded-md border border-line">
              {pack.services.map((s) => (
                <li key={s.name} className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                  <span>{s.name}</span>
                  <span className="shrink-0 text-ink-muted tabular">
                    {formatMoney(s.price)} <span className="text-xs">{UNIT_LABELS[s.unit]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-medium">Sales stages</h3>
            <p className="mt-2 text-ink-muted">{pack.pipelineStages.join("  →  ")}</p>
          </section>
          <section>
            <h3 className="font-medium">Event checklist</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-muted">
              {pack.checklist.map((c) => (
                <li key={c.title}>{c.title}</li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <Button variant="ghost" size="sm" className="-ml-3 mt-3" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Hide details" : "See what's included"}
      </Button>
    </Card>
  );
}
