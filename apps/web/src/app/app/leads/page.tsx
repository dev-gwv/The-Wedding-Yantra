"use client";

import { formatMoneyShort, leadScope } from "@wedding-yantra/core";
import { useLeads } from "@wedding-yantra/api-client/react";
import type { LeadList, LeadSummary } from "@wedding-yantra/types";
import { BellRing, Inbox, Lock, Plus, Search, Share2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { LeadCard } from "@/components/sales/lead-card";
import { LeadFormSheet } from "@/components/sales/lead-form-sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

type View = "follow-ups" | "pipeline";

function LeadsScreen() {
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view: View = params.get("view") === "pipeline" ? "pipeline" : "follow-ups";
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const leads = useLeads(workspace.id, q ? { q } : {});
  const [adding, setAdding] = useState(false);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  if (leadScope(workspace.role) === "none") {
    return (
      <>
        <PageHeader title="Leads" />
        <Card>
          <EmptyState icon={Lock} title="Leads aren't part of your role">
            The owner or a manager handles enquiries. Ask them if you need access.
          </EmptyState>
        </Card>
      </>
    );
  }

  const data = leads.data;
  const isEmpty = data && data.leads.length === 0 && !q;

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={data ? `${data.leads.length} ${data.leads.length === 1 ? "enquiry" : "enquiries"}` : undefined}
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" strokeWidth={2.5} /> Add lead
          </Button>
        }
      />

      {!isEmpty && (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-2xl border border-line bg-cream p-1" role="tablist" aria-label="Leads view">
            {(
              [
                ["follow-ups", "Follow-ups"],
                ["pipeline", "Pipeline"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                onClick={() => setParam("view", key === "follow-ups" ? null : key)}
                className={cn(
                  "h-10 flex-1 rounded-xl px-5 text-sm font-bold transition sm:flex-none",
                  view === key ? "bg-surface text-ink shadow-soft" : "text-ink-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <span className="sr-only">Search leads</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or number"
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-[15px] placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none"
            />
          </label>
        </div>
      )}

      {leads.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {leads.isError && <Notice tone="danger">{errorMessage(leads.error)}</Notice>}

      {isEmpty && (
        <Card>
          <EmptyState
            icon={Inbox}
            title="Add your first lead"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setAdding(true)}>
                  <Plus className="size-4" strokeWidth={2.5} /> Add lead
                </Button>
                <ButtonLink href="/app/settings/enquiry-form" variant="secondary">
                  <Share2 className="size-4" /> Share enquiry form
                </ButtonLink>
              </div>
            }
          >
            Every enquiry from Instagram, WhatsApp, calls and referrals goes here, so no one slips through.
          </EmptyState>
        </Card>
      )}

      {data && !isEmpty && data.leads.length === 0 && (
        <p className="py-12 text-center text-ink-muted">No leads match &ldquo;{q}&rdquo;.</p>
      )}

      {data && data.leads.length > 0 && view === "follow-ups" && <FollowUps leads={data.leads} />}
      {data && data.leads.length > 0 && view === "pipeline" && (
        <Pipeline data={data} stageParam={params.get("stage")} onStage={(id) => setParam("stage", id)} />
      )}

      <LeadFormSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(lead) => {
          setAdding(false);
          router.push(`/app/leads/${lead.id}`);
        }}
      />
    </>
  );
}

function FollowUps({ leads }: { leads: LeadSummary[] }) {
  const groups = [
    { key: "overdue", title: "Overdue", items: leads.filter((l) => l.followUpState === "overdue") },
    { key: "today", title: "Today", items: leads.filter((l) => l.followUpState === "today") },
    { key: "upcoming", title: "Coming up", items: leads.filter((l) => l.followUpState === "upcoming") },
  ].filter((g) => g.items.length > 0);
  const byTime = (a: LeadSummary, b: LeadSummary) => (a.nextFollowUpAt ?? "").localeCompare(b.nextFollowUpAt ?? "");
  const noDate = leads.filter((l) => l.stageKind === "open" && l.followUpState === "none");

  return (
    <div className="space-y-8">
      {groups.length === 0 && (
        <Card>
          <EmptyState icon={BellRing} title="No follow-ups due">
            Open a lead and set a follow-up. It shows up here and on Home when it&apos;s time.
          </EmptyState>
        </Card>
      )}
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className={cn("mb-3 font-display text-lg font-extrabold", g.key === "overdue" && "text-danger")}>
            {g.title} <span className="font-sans text-sm font-semibold text-ink-muted">· {g.items.length}</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...g.items].sort(byTime).map((lead) => (
              <LeadCard key={lead.id} lead={lead} showStage />
            ))}
          </div>
        </section>
      ))}
      {noDate.length > 0 && (
        <section>
          <h2 className="mb-1 font-display text-lg font-extrabold">
            No follow-up set <span className="font-sans text-sm font-semibold text-ink-muted">· {noDate.length}</span>
          </h2>
          <p className="mb-3 text-sm text-ink-muted">Open ones with no next step. Give each a follow-up so none goes cold.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {noDate.map((lead) => (
              <LeadCard key={lead.id} lead={lead} showStage />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Pipeline({ data, stageParam, onStage }: { data: LeadList; stageParam: string | null; onStage: (id: string) => void }) {
  const stage = data.stages.find((s) => s.id === stageParam) ?? data.stages.find((s) => s.leadCount > 0) ?? data.stages[0];
  const inStage = (id: string) => data.leads.filter((l) => l.stageId === id);

  return (
    <>
      {/* Phone and tablet: pick a stage, see its leads */}
      <div className="lg:hidden">
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6" role="tablist" aria-label="Stages">
          {data.stages.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === stage?.id}
              onClick={() => onStage(s.id)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition",
                s.id === stage?.id ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
              )}
            >
              {s.name}
              <span className={cn("tabular", s.id === stage?.id ? "text-on-brand/85" : "text-ink-muted")}>{s.leadCount}</span>
            </button>
          ))}
        </div>
        {stage && (
          <div className="space-y-3">
            {stage.value > 0 && <p className="text-sm text-ink-muted">Worth {formatMoneyShort(stage.value)} in budgets</p>}
            {inStage(stage.id).map((lead) => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
            {inStage(stage.id).length === 0 && <p className="py-10 text-center text-ink-muted">No leads in {stage.name}.</p>}
          </div>
        )}
      </div>

      {/* Desktop: the full board */}
      <div className="-mx-8 hidden overflow-x-auto px-8 pb-4 lg:block">
        <div className="flex gap-4">
          {data.stages.map((s) => (
            <section key={s.id} className="w-72 shrink-0 rounded-3xl bg-cream p-3" aria-label={s.name}>
              <header className="flex items-baseline justify-between px-2 pb-3 pt-1">
                <h2 className="font-display text-base font-extrabold">{s.name}</h2>
                <span className="text-sm font-semibold text-ink-muted tabular">
                  {s.leadCount}
                  {s.value > 0 && ` · ${formatMoneyShort(s.value)}`}
                </span>
              </header>
              <div className="space-y-2">
                {inStage(s.id).map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
                {inStage(s.id).length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-subtle">Empty</p>}
              </div>
            </section>
          ))}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-muted">
        Move a lead between stages from its page.{" "}
        <Link href="/app/settings/stages" className="font-bold text-brand-strong hover:text-brand-deep">
          Edit stages
        </Link>
      </p>
    </>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<Splash />}>
      <LeadsScreen />
    </Suspense>
  );
}
