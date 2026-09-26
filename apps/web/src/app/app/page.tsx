"use client";

import { can, eventScope, firstName, formatMoney, formatMoneyShort, greeting, leadScope, todayIn, type Role } from "@wedding-yantra/core";
import { useHome, useMyDay } from "@wedding-yantra/api-client/react";
import type { HomeSummary } from "@wedding-yantra/types";
import {
  AlarmClock,
  BellRing,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  CreditCard,
  FileText,
  Inbox,
  IndianRupee,
  MessageSquareText,
  Package,
  PartyPopper,
  ReceiptText,
  Sparkles,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { EventCard } from "@/components/bookings/event-card";
import { ExpenseSheet } from "@/components/money/expense-sheet";
import { DueRow } from "@/components/money/rows";
import { LeadCard } from "@/components/sales/lead-card";
import { LeadFormSheet } from "@/components/sales/lead-form-sheet";
import { MyDayCard, myDayHasContent } from "@/components/tasks/my-day";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Eyebrow, GradientTile, IconSquare, NextStepCard, Notice, PageHeader, ProgressBar } from "@/components/ui/misc";
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
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: workspace.timezone }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>{workspace.name}</Eyebrow>}
        title={`${hello}${me.user.name ? `, ${firstName(me.user.name)}` : ""}`}
        subtitle={today}
      />

      {home.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {home.isError && !home.data && (
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
  const sells = leadScope(role) !== "none";

  return (
    <div className="space-y-6">
      <QuickActions role={role} />

      {showSetup && <SetupCard home={home} />}

      <PlanBanner billing={home.billing ?? null} />

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

      {/* Owed to clients: late ones first; otherwise what's due this week. */}
      {home.deliverables && (home.deliverables.late > 0 || home.deliverables.dueThisWeek > 0) && (
        <Banner href="/app/deliverables" icon={Package} tone={home.deliverables.late > 0 ? "danger" : undefined}>
          {home.deliverables.late > 0
            ? `${home.deliverables.late} deliverable${home.deliverables.late === 1 ? " is" : "s are"} late for clients`
            : `${home.deliverables.dueThisWeek} deliverable${home.deliverables.dueThisWeek === 1 ? "" : "s"} due to clients this week`}
        </Banner>
      )}

      {/* Closing time: the day's summary is ready to send. */}
      {offerSummary && (
        <Banner href="/app/summary" icon={MessageSquareText}>
          Today&apos;s summary is ready to send
        </Banner>
      )}

      {(sells || home.money) && <Numbers home={home} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
        <div className="space-y-6">
          {day && <MyDayCard day={day} />}
          {sells ? (
            <FollowUps home={home} />
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
        </div>

        <div className="space-y-6">
          {home.money && home.money.toCollect > 0 && (
            <section>
              <SectionHead title="To collect" href="/app/money" link="See all" />
              <Card className="divide-y divide-line overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
                  <span className="font-display text-2xl font-extrabold tabular">{formatMoney(home.money.toCollect)}</span>
                  {home.money.overdue > 0 && <span className="text-sm font-semibold text-danger">{formatMoney(home.money.overdue)} overdue</span>}
                </div>
                {home.money.due.map((d) => (
                  <DueRow key={`${d.kind}-${d.billId ?? d.eventId}`} item={d} />
                ))}
              </Card>
            </section>
          )}

          {coming.length > 0 ? (
            <section>
              <SectionHead title="Coming up" href="/app/events?view=calendar" link="Calendar" />
              <div className="space-y-3">
                {coming.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          ) : (
            eventScope(role) !== "none" && (
              <Card className="flex items-center gap-3 p-5">
                <IconSquare icon={CalendarDays} className="size-10 [&_svg]:size-5" />
                <div>
                  <p className="font-bold">No events in the next two weeks</p>
                  <p className="text-sm text-ink-muted">Booked events show here with their dates and venues.</p>
                </div>
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHead({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      <Link href={href} className="text-sm font-bold text-brand-strong hover:text-brand-deep">
        {link}
      </Link>
    </div>
  );
}

/** The everyday things, one tap from Home. */
function QuickActions({ role }: { role: Role }) {
  const router = useRouter();
  const [adding, setAdding] = useState<"lead" | "expense" | null>(null);
  const actions: { label: string; icon: LucideIcon; onClick?: () => void; href?: string }[] = [
    ...(can(role, "leads.work") ? [{ label: "Add enquiry", icon: UserPlus, onClick: () => setAdding("lead") }] : []),
    ...(can(role, "quotes.manage") ? [{ label: "Make a quote", icon: FileText, href: "/app/quotes/new" }] : []),
    ...(can(role, "events.manage") ? [{ label: "Add event", icon: CalendarPlus, href: "/app/events/new" }] : []),
    ...(can(role, "expenses.submit") ? [{ label: "Add expense", icon: ReceiptText, onClick: () => setAdding("expense") }] : []),
  ];
  if (!actions.length) return null;
  const tile =
    "flex flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-1.5 py-3.5 text-center text-[13px] font-bold leading-tight shadow-soft transition hover:border-sun-300 motion-safe:hover:-translate-y-0.5 sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:py-4 sm:text-left sm:text-[15px]";
  return (
    <>
      <nav aria-label="Quick actions" className={cn("grid gap-2 sm:gap-3", ["", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"][actions.length])}>
        {actions.map((a) =>
          a.href ? (
            <Link key={a.label} href={a.href} className={tile}>
              <GradientTile icon={a.icon} className="size-10 rounded-xl [&_svg]:size-5" />
              {a.label}
            </Link>
          ) : (
            <button key={a.label} type="button" onClick={a.onClick} className={tile}>
              <GradientTile icon={a.icon} className="size-10 rounded-xl [&_svg]:size-5" />
              {a.label}
            </button>
          ),
        )}
      </nav>
      <LeadFormSheet
        open={adding === "lead"}
        onClose={() => setAdding(null)}
        onSaved={(lead) => {
          setAdding(null);
          router.push(`/app/leads/${lead.id}`);
        }}
      />
      <ExpenseSheet open={adding === "expense"} onClose={() => setAdding(null)} />
    </>
  );
}

/** How the month is going, for those who see money; the day's follow-ups for everyone else. */
function Numbers({ home }: { home: HomeSummary }) {
  const { overdue, dueToday, newLeads, openValue, monthEnquiries, monthBooked } = home.sales;
  const month = new Intl.DateTimeFormat("en-IN", { month: "long" }).format(new Date());
  const tiles: { label: string; value: string; icon: LucideIcon; href: string; tone?: "danger"; note?: string; noteTone?: "brand" }[] = home.money
    ? [
        { label: `Enquiries in ${month}`, value: String(monthEnquiries ?? 0), icon: Inbox, href: "/app/leads?view=pipeline" },
        {
          label: `Booked in ${month}`,
          value: String(monthBooked ?? 0),
          icon: PartyPopper,
          href: "/app/events",
          note: home.sales.monthBookedValue ? formatMoneyShort(home.sales.monthBookedValue) : undefined,
          noteTone: "brand",
        },
        { label: `Received in ${month}`, value: formatMoneyShort(home.money.receivedThisMonth ?? 0), icon: IndianRupee, href: "/app/money" },
        {
          label: "To collect",
          value: formatMoneyShort(home.money.toCollect),
          icon: Wallet,
          href: "/app/money",
          tone: home.money.overdue > 0 ? "danger" : undefined,
          note: home.money.overdue > 0 ? `${formatMoneyShort(home.money.overdue)} late` : undefined,
        },
      ]
    : [
        { label: "Follow-ups late", value: String(overdue), icon: AlarmClock, href: "/app/leads", tone: overdue > 0 ? "danger" : undefined },
        { label: "Follow-ups today", value: String(dueToday), icon: BellRing, href: "/app/leads" },
        { label: "New enquiries", value: String(newLeads), icon: Inbox, href: "/app/leads?view=pipeline" },
        { label: "In the pipeline", value: formatMoneyShort(openValue), icon: IndianRupee, href: "/app/leads?view=pipeline" },
      ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="flex items-start justify-between gap-2 rounded-3xl border border-line bg-surface p-4 shadow-soft transition hover:border-sun-300 sm:p-5">
          <div className="min-w-0">
            <p className={cn("font-display text-2xl font-extrabold leading-tight tabular sm:text-[28px]", t.tone === "danger" && "text-danger")}>{t.value}</p>
            <p className="mt-0.5 text-xs font-semibold text-ink-muted sm:text-sm">{t.label}</p>
            {t.note && <p className={cn("mt-1 text-xs font-bold", t.noteTone === "brand" ? "text-brand-strong" : "text-danger")}>{t.note}</p>}
          </div>
          <IconSquare icon={t.icon} className={cn("size-8 shrink-0 rounded-lg [&_svg]:size-4 sm:size-9", t.tone === "danger" && "bg-danger-soft text-danger")} />
        </Link>
      ))}
    </div>
  );
}

/** Who to call or message first: follow-ups late or due today. */
function FollowUps({ home }: { home: HomeSummary }) {
  const { due, overdue, dueToday } = home.sales;
  if (!due.length) {
    return (
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
          Enquiries to call back show up here, so you know who to reach first each morning.
        </EmptyState>
      </Card>
    );
  }
  return (
    <section>
      <SectionHead title="Follow up first" href="/app/leads" link="See all" />
      <p className="-mt-2 mb-3 text-sm text-ink-muted">
        {overdue > 0 && <span className="font-semibold text-danger">{overdue} late</span>}
        {overdue > 0 && dueToday > 0 && " · "}
        {dueToday > 0 && `${dueToday} for today`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {due.map((lead) => (
          <LeadCard key={lead.id} lead={lead} showStage />
        ))}
      </div>
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
            <h2 className="font-display text-xl font-extrabold">Get set up in {home.setupTotal} steps</h2>
            <span className="text-sm font-semibold text-ink-muted tabular">
              {home.setupDone} of {home.setupTotal} done
            </span>
          </div>
          <div className="mt-3">
            <ProgressBar value={(home.setupDone / home.setupTotal) * 100} label="Setup progress" />
          </div>
        </div>
      </div>
      <ol className="mt-5 grid gap-2 md:grid-cols-3">
        {home.setup.map((step, i) => {
          const href = SETUP_LINKS[step.key];
          const body = (
            <>
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold",
                  step.done ? "bg-success text-on-brand" : "bg-cream text-brand-strong",
                )}
              >
                {step.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-bold", step.done && "text-ink-muted line-through")}>{step.title}</span>
                {!step.done && <span className="mt-0.5 block text-sm text-ink-muted">{step.description}</span>}
              </span>
              {!step.done && href && <ChevronRight className="mt-0.5 size-4 shrink-0 text-brand-strong" />}
            </>
          );
          return (
            <li key={step.key}>
              {!step.done && href ? (
                <Link href={href} className="flex h-full items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 transition hover:border-sun-300">
                  {body}
                </Link>
              ) : (
                <div className="flex h-full items-start gap-3 rounded-2xl px-4 py-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </NextStepCard>
  );
}

/** The owner hears about the plan only when it matters: the trial's last days, or a problem. */
function PlanBanner({ billing }: { billing: HomeSummary["billing"] }) {
  if (!billing?.enforced) return null;
  if (billing.status === "expired") {
    return (
      <Banner href="/app/billing" icon={CreditCard} tone="danger">
        Your free trial has ended. Choose a plan to keep adding things
      </Banner>
    );
  }
  if (billing.status === "past_due") {
    return (
      <Banner href="/app/billing" icon={CreditCard} tone="danger">
        Your last payment didn&apos;t go through
      </Banner>
    );
  }
  if (billing.status === "trial" && billing.trialDaysLeft <= 3) {
    return (
      <Banner href="/app/billing" icon={CreditCard}>
        Your free trial ends in {billing.trialDaysLeft} day{billing.trialDaysLeft === 1 ? "" : "s"}. Choose a plan
      </Banner>
    );
  }
  return null;
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
