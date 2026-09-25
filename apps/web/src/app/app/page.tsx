"use client";

import { can, firstName, formatMoney, formatMoneyShort, greeting, leadScope, todayIn, type Role } from "@wedding-yantra/core";
import { useHome, useMyDay } from "@wedding-yantra/api-client/react";
import { UNIT_LABELS, type HomeSummary } from "@wedding-yantra/types";
import {
  AlarmClock,
  BellRing,
  Check,
  ChevronRight,
  GitBranch,
  Inbox,
  IndianRupee,
  ListChecks,
  MessageSquareText,
  Package,
  ReceiptText,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { LeadCard } from "@/components/sales/lead-card";
import { EventCard } from "@/components/bookings/event-card";
import { DueRow } from "@/components/money/rows";
import { MyDayCard, myDayHasContent } from "@/components/tasks/my-day";
import { ButtonLink } from "@/components/ui/button";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import {
  Card,
  EmptyState,
  Eyebrow,
  GradientTile,
  IconSquare,
  NextStepCard,
  Notice,
  PageHeader,
  ProgressBar,
} from "@/components/ui/misc";
import { BusinessIcon } from "@/components/app/business-icon";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { SETUP_LINKS } from "@/lib/links";
import { summarySentOn } from "@/lib/summary-sent";

export default function HomePage() {
  const { me, workspace } = useCurrentWorkspace();
  const home = useHome(workspace.id);
  // Signed-in screens only render in the browser, so the viewer's own clock is used.
  const hello = greeting(new Date().getHours());

  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>{workspace.name}</Eyebrow>}
        title={`${hello}${me.user.name ? `, ${firstName(me.user.name)}` : ""}`}
        subtitle="Here's what needs you today."
      />

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
      {home.data && <HomeContent home={home.data} role={workspace.role} icon={workspace.businessTypeIcon} />}
    </>
  );
}

function HomeContent({ home, role, icon }: { home: HomeSummary; role: Role; icon: string }) {
  const { workspace } = useCurrentWorkspace();
  // Setup steps are the owner's and manager's job; others never see a to-do they can't do.
  const showSetup = can(role, "workspace.update") && home.setupDone < home.setupTotal;
  const works = can(role, "tasks.work");
  const myDay = useMyDay(workspace.id, works);
  const day = myDay.data && myDayHasContent(myDay.data) ? myDay.data : null;
  // `tasks` can be missing for a minute while a new web version waits on the API's deploy.
  const teamLate = home.tasks?.teamOverdue ?? 0;
  // After 5 pm, until today's summary has been sent from this device.
  const [summarySent] = useState(() => summarySentOn(workspace.id) === todayIn(workspace.timezone));
  const offerSummary = can(role, "team.review") && new Date().getHours() >= 17 && !summarySent;
  // Events already in "Your day" aren't listed twice.
  const coming = home.upcomingEvents.filter((e) => !day?.events.some((d) => d.id === e.id));

  return (
    <div className="space-y-6">
      {showSetup && <SetupCard home={home} />}

      {home.money && home.money.pendingExpenses > 0 && (
        <Banner href="/app/money?view=expenses" icon={ReceiptText}>
          {home.money.pendingExpenses} expense{home.money.pendingExpenses === 1 ? "" : "s"} from your team to approve
        </Banner>
      )}
      {teamLate > 0 && (
        <Banner href="/app/tasks?view=team" icon={AlarmClock} tone="danger">
          {teamLate} team task{teamLate === 1 ? " is" : "s are"} late
        </Banner>
      )}

      {/* Closing time: the day's summary is ready to send. */}
      {offerSummary && (
        <Banner href="/app/summary" icon={MessageSquareText}>
          Today&apos;s summary is ready to send
        </Banner>
      )}

      {day && <MyDayCard day={day} />}

      {leadScope(role) !== "none" ? (
        <Today home={home} />
      ) : (
        !day &&
        !(works && myDay.isPending) && (
          <Card>
            <EmptyState icon={Inbox} title="Nothing needs you today">
              Your events and tasks will show up here, so you know what to do first each morning.
            </EmptyState>
          </Card>
        )
      )}

      {home.money && home.money.toCollect > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">To collect</h2>
            <Link href="/app/money" className="text-sm font-bold text-brand-strong hover:text-brand-deep">
              See all
            </Link>
          </div>
          <Card className="divide-y divide-line overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
              <span className="font-display text-2xl font-extrabold tabular">{formatMoney(home.money.toCollect)}</span>
              {home.money.overdue > 0 && (
                <span className="text-sm font-semibold text-danger">{formatMoney(home.money.overdue)} overdue</span>
              )}
            </div>
            {home.money.due.map((d) => (
              <DueRow key={`${d.kind}-${d.billId ?? d.eventId}`} item={d} />
            ))}
          </Card>
        </section>
      )}

      {coming.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Coming up in two weeks</h2>
            <Link href="/app/events?view=calendar" className="text-sm font-bold text-brand-strong hover:text-brand-deep">
              Calendar
            </Link>
          </div>
          <div className="space-y-3">
            {coming.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </section>
      )}

      {/* What the business started with: for the people who set it up and change it. */}
      {can(role, "workspace.update") && <StarterPack home={home} icon={icon} />}
    </div>
  );
}

/** One line that needs someone's attention, with a way straight to it. */
function Banner({ href, icon: Icon, tone, children }: { href: string; icon: LucideIcon; tone?: "danger"; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-4 py-3 font-semibold",
        tone === "danger" ? "border-danger/25 bg-danger-soft text-danger hover:border-danger/50" : "border-sun-300/60 bg-cream hover:border-sun-300",
      )}
    >
      <Icon className={cn("size-5 shrink-0", tone === "danger" ? "text-danger" : "text-brand-strong")} />
      <span className="flex-1">{children}</span>
      <ChevronRight className="size-4 text-ink-subtle" />
    </Link>
  );
}

/** What to do first today: follow-ups due, new enquiries and what's in the pipeline. */
function Today({ home }: { home: HomeSummary }) {
  const { overdue, dueToday, newLeads, openValue, due } = home.sales;
  const tiles: { label: string; value: string; icon: LucideIcon; tone?: "danger" }[] = [
    { label: "Follow-ups late", value: String(overdue), icon: AlarmClock, tone: overdue > 0 ? "danger" : undefined },
    { label: "Follow-ups today", value: String(dueToday), icon: BellRing },
    { label: "New enquiries", value: String(newLeads), icon: Inbox },
    { label: "In the pipeline", value: formatMoneyShort(openValue), icon: IndianRupee },
  ];

  return (
    <section className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <IconSquare icon={t.icon} className={cn("size-9 [&_svg]:size-4", t.tone === "danger" && "bg-danger-soft text-danger")} />
            <dd className={cn("mt-3 font-display text-2xl font-extrabold tabular", t.tone === "danger" && "text-danger")}>{t.value}</dd>
            <dt className="text-xs font-semibold text-ink-muted">{t.label}</dt>
          </Card>
        ))}
      </dl>

      {due.length > 0 ? (
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-lg font-extrabold">Follow up first</h2>
            <Link href="/app/leads" className="text-sm font-bold text-brand-strong hover:text-brand-deep">
              See all
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {due.map((lead) => (
              <LeadCard key={lead.id} lead={lead} showStage />
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Inbox}
            title="No follow-ups due today"
            action={
              <ButtonLink href="/app/leads" variant="secondary">
                Go to leads
              </ButtonLink>
            }
          >
            Follow-ups that are due and new enquiries show up here, so you know what to do first each morning.
          </EmptyState>
        </Card>
      )}
    </section>
  );
}

function SetupCard({ home }: { home: HomeSummary }) {
  return (
    <NextStepCard className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <GradientTile icon={Sparkles} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-extrabold">Get set up</h2>
            <span className="text-sm font-semibold text-ink-muted tabular">
              {home.setupDone} of {home.setupTotal} done
            </span>
          </div>
          <div className="mt-3">
            <ProgressBar value={(home.setupDone / home.setupTotal) * 100} label="Setup progress" />
          </div>
        </div>
      </div>
      <ul className="mt-5 space-y-2">
        {home.setup.map((step) => {
          const href = SETUP_LINKS[step.key];
          const body = (
            <>
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border",
                  step.done ? "border-success bg-success text-on-brand" : "border-line-strong bg-surface",
                )}
              >
                {step.done && <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-bold", step.done && "font-semibold text-ink-muted line-through")}>
                  {step.title}
                </span>
                {!step.done && <span className="mt-0.5 block text-sm text-ink-muted">{step.description}</span>}
              </span>
              {!step.done && href && <ChevronRight className="size-4 shrink-0 text-brand-strong" />}
            </>
          );
          return (
            <li key={step.key}>
              {!step.done && href ? (
                <Link
                  href={href}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition hover:border-sun-300"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </NextStepCard>
  );
}

/** What we prepared for this kind of business. Details stay folded until asked for. */
function StarterPack({ home, icon }: { home: HomeSummary; icon: string }) {
  const [open, setOpen] = useState(false);
  const pack = home.starterPack;
  const counts: { label: string; value: number; icon: LucideIcon }[] = [
    { label: "Services", value: pack.services.length, icon: Package },
    { label: "Sales stages", value: pack.pipelineStages.length, icon: GitBranch },
    { label: "Checklist", value: pack.checklist.length, icon: ListChecks },
  ];

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cream text-brand-strong">
          <BusinessIcon name={icon} className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-extrabold">Ready for your {home.businessTypeName.toLowerCase()} business</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            A starting set you&apos;ll use for quotes, sales and events. Every item can be changed.
          </p>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-3 gap-3">
        {counts.map((c) => (
          <div key={c.label} className="rounded-2xl border border-line p-3 sm:p-4">
            <IconSquare icon={c.icon} className="size-9 [&_svg]:size-4" />
            <dd className="mt-3 font-display text-2xl font-extrabold tabular">{c.value}</dd>
            <dt className="text-xs font-semibold text-ink-muted">{c.label}</dt>
          </div>
        ))}
      </dl>

      {open && (
        <div className="mt-6 space-y-6 text-sm">
          <section>
            <h3 className="font-display text-base font-extrabold">Services</h3>
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
              {pack.services.map((s) => (
                <li key={s.name} className="flex items-baseline justify-between gap-4 px-4 py-3">
                  <span className="font-semibold">{s.name}</span>
                  <span className="shrink-0 text-ink-muted tabular">
                    <span className="font-bold text-ink">{formatMoney(s.price)}</span>{" "}
                    <span className="text-xs">{UNIT_LABELS[s.unit]}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-display text-base font-extrabold">Sales stages</h3>
            <ol className="mt-2 flex flex-wrap gap-2">
              {pack.pipelineStages.map((stage) => (
                <li key={stage} className="rounded-full bg-cream px-3 py-1 text-xs font-semibold">
                  {stage}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h3 className="font-display text-base font-extrabold">Event checklist</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-muted">
              {pack.checklist.map((c) => (
                <li key={c.title}>{c.title}</li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <button
        type="button"
        className="mt-4 text-sm font-bold text-brand-strong hover:text-brand-deep"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "Hide details" : "See what's included"}
      </button>
    </Card>
  );
}
