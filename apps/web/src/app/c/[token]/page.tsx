"use client";

import { formatDate, formatMoney, formatPhone, normalizePhone, PAYMENT_METHOD_LABELS, referralMessage, whatsappLink } from "@wedding-yantra/core";
import { usePortal } from "@wedding-yantra/api-client/react";
import { EVENT_LABELS, type ClientPortal, type PortalEvent } from "@wedding-yantra/types";
import { CalendarHeart, ChevronRight, Clock, Copy, ExternalLink, Heart, MapPin, MessageCircle, Phone, Star, UserX } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { BusinessMark } from "@/components/app/business-mark";
import { LogoMark } from "@/components/app/logo";
import { eventDates } from "@/components/bookings/event-card";
import { buttonClass } from "@/components/ui/button";
import { Card, EmptyState, GradientTile, NextStepCard, Pill } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { referralUrl } from "@/lib/links";

/** A client's own page: everything they have with the business, always current. No sign-in. */
export default function ClientPortalPage() {
  const { token } = useParams<{ token: string }>();
  const portal = usePortal(token);

  if (portal.isPending) return <Splash />;
  if (portal.isError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-hero px-4">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-soft">
          <EmptyState icon={UserX} title="This page isn't available" className="py-6">
            The link may be old. Please ask the business to send it again.
          </EmptyState>
        </div>
      </main>
    );
  }
  return <Portal data={portal.data} />;
}

function Portal({ data }: { data: ClientPortal }) {
  const { business, client, events, quotes, bills, payments, totals } = data;
  const first = client.name.trim().split(/\s+/)[0];
  const nothingYet = events.length === 0 && quotes.length === 0 && bills.length === 0 && payments.length === 0;
  const dueBills = bills.filter((b) => b.due > 0);
  // The business phone is typed in freely; WhatsApp needs the full number.
  const phone = business.phone ? (normalizePhone(business.phone) ?? business.phone) : null;

  return (
    <div className="min-h-dvh bg-surface">
      <header className="bg-hero">
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-8 sm:px-6 sm:pt-10">
          <div className="flex items-center gap-3">
            <BusinessMark logoUrl={business.logoUrl} icon={business.icon} name={business.name} />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-extrabold">{business.name}</p>
              <p className="text-sm text-ink-muted">
                {business.typeName} · {business.city}
              </p>
            </div>
          </div>
          <h1 className="mt-8 font-display text-[clamp(32px,7vw,48px)] font-extrabold leading-tight">Hi {first}</h1>
          <p className="mt-1 text-lg text-ink-muted">Everything for your celebration with {business.name}, always up to date.</p>
          {phone && (
            <div className="mt-6 flex flex-wrap gap-2">
              <a href={whatsappLink(`Hi, this is ${client.name}. `, phone)} target="_blank" rel="noopener noreferrer" className={buttonClass()}>
                <MessageCircle className="size-4" /> WhatsApp us
              </a>
              <a href={`tel:${phone}`} className={buttonClass({ variant: "secondary" })}>
                <Phone className="size-4" /> {formatPhone(phone)}
              </a>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        {nothingYet && (
          <Card className="p-6">
            <EmptyState icon={CalendarHeart} title="Nothing here yet" className="py-4">
              {business.name} will add your event dates, quotes and bills here.
            </EmptyState>
          </Card>
        )}

        {totals.due > 0 && (
          <NextStepCard className="p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink-muted">Balance due</p>
            <p className="font-display text-4xl font-extrabold tabular">{formatMoney(totals.due)}</p>
            {dueBills.length === 1 ? (
              <Link href={`/b/${dueBills[0]!.token}`} className={buttonClass({ size: "lg", className: "mt-4 sm:w-auto sm:px-8" })}>
                See the bill and pay
              </Link>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">Open a bill below to see it and pay by UPI.</p>
            )}
          </NextStepCard>
        )}

        {data.eventOver && business.reviewUrl && (
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <GradientTile icon={Star} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-extrabold">Loved our work?</p>
              <p className="text-sm text-ink-muted">A short review helps other families find {business.name}. Thank you!</p>
            </div>
            <a href={business.reviewUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", className: "shrink-0" })}>
              <Star className="size-4" /> Leave a review
            </a>
          </Card>
        )}

        {events.length > 0 && (
          <Section title={events.length === 1 ? "Your event" : "Your events"}>
            <div className="space-y-4">
              {events.map((e, i) => (
                <EventBlock key={`${e.title}-${i}`} event={e} />
              ))}
            </div>
          </Section>
        )}

        {bills.length > 0 && (
          <Section title="Bills">
            <Card className="divide-y divide-line overflow-hidden">
              {bills.map((b) => (
                <Row
                  key={b.token}
                  href={`/b/${b.token}`}
                  title={b.number}
                  sub={`${formatDate(b.issueDate)}${b.due > 0 && b.dueDate ? ` · due by ${formatDate(b.dueDate, { year: false })}` : ""}`}
                  amount={b.total}
                  badge={b.due > 0 ? <span className={b.overdue ? "text-danger" : "text-ink-muted"}>{formatMoney(b.due)} due</span> : <Pill tone="success">Paid</Pill>}
                />
              ))}
            </Card>
          </Section>
        )}

        {quotes.length > 0 && (
          <Section title="Quotes">
            <Card className="divide-y divide-line overflow-hidden">
              {quotes.map((q) => (
                <Row
                  key={q.token}
                  href={`/q/${q.token}`}
                  title={q.title ?? q.number}
                  sub={`${q.number} · ${formatDate(q.issueDate)}`}
                  amount={q.total}
                  badge={
                    q.status === "accepted" ? (
                      <Pill tone="success">Accepted</Pill>
                    ) : q.expired ? (
                      <Pill>Expired</Pill>
                    ) : (
                      <Pill tone="brand">Waiting for you</Pill>
                    )
                  }
                />
              ))}
            </Card>
          </Section>
        )}

        {payments.length > 0 && (
          <Section title="What you've paid">
            <Card className="divide-y divide-line overflow-hidden">
              {payments.map((p) => (
                <div key={p.number} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="font-semibold tabular">{formatDate(p.paidOn)}</p>
                    <p className="text-sm text-ink-muted">
                      {PAYMENT_METHOD_LABELS[p.method]} · Receipt {p.number}
                    </p>
                  </div>
                  <p className="font-bold tabular">{formatMoney(p.amount, { paise: p.amount % 1 !== 0 })}</p>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 bg-cream/60 px-5 py-3.5">
                <p className="font-bold">Paid so far</p>
                <p className="font-display text-lg font-extrabold tabular">{formatMoney(totals.paid, { paise: totals.paid % 1 !== 0 })}</p>
              </div>
            </Card>
          </Section>
        )}

        {business.formSlug && <Recommend data={data} />}

        <p className="flex items-center justify-center gap-2 pt-2 text-xs text-ink-muted">
          <LogoMark className="size-5" /> Powered by Wedding Yantra
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ href, title, sub, amount, badge }: { href: string; title: string; sub: string; amount: number; badge: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-5 py-4 hover:bg-cream">
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{title}</p>
        <p className="text-sm text-ink-muted tabular">{sub}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold tabular">{formatMoney(amount)}</p>
        <div className="mt-0.5 text-sm font-semibold tabular">{badge}</div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
    </Link>
  );
}

function EventBlock({ event }: { event: PortalEvent }) {
  const days = [...new Set(event.functions.map((f) => f.date))];
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        {event.eventType && <Pill tone="brand">{EVENT_LABELS[event.eventType]}</Pill>}
        {event.status === "completed" && <Pill tone="success">Done</Pill>}
      </div>
      <h3 className="mt-2 font-display text-xl font-extrabold">{event.title}</h3>
      <p className="text-ink-muted">
        {eventDates(event)}
        {event.venue && ` · ${event.venue}`}
        {event.city && `, ${event.city}`}
      </p>
      {days.length > 0 && (
        <ol className="mt-4 space-y-3 border-t border-line pt-4">
          {days.map((day) => (
            <li key={day}>
              <p className="text-sm font-bold text-brand-strong">{formatDate(day)}</p>
              <ul className="mt-1 space-y-1.5">
                {event.functions
                  .filter((f) => f.date === day)
                  .map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
                      <span className="font-semibold">{f.name}</span>
                      <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                        <Clock className="size-3.5" /> {f.startTime ?? "Time to be set"}
                      </span>
                      {(f.venue ?? event.venue) && (
                        <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
                          <MapPin className="size-3.5" /> {f.venue ?? event.venue}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {/* Missing for a minute while a new web version waits on the API's deploy. */}
      {(event.deliverables ?? []).length > 0 && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="text-sm font-bold text-brand-strong">What you&apos;ll receive</p>
          <ul className="mt-2 space-y-2.5">
            {event.deliverables.map((d, i) => (
              <li key={`${d.title}-${i}`} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{d.title}</p>
                  <p className="text-sm text-ink-muted">
                    {d.status === "delivered" ? "Ready" : d.dueDate ? `By ${formatDate(d.dueDate)}` : "Date to be set"}
                  </p>
                </div>
                {d.status === "delivered" ? (
                  d.link ? (
                    <a href={d.link} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", size: "sm", className: "shrink-0" })}>
                      <ExternalLink className="size-4" /> Open
                    </a>
                  ) : (
                    <Pill tone="success">Ready</Pill>
                  )
                ) : (
                  d.status === "in_progress" && <Pill tone="brand">Working on it</Pill>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Happy clients recommend the business; enquiries from this link are credited to them. */
function Recommend({ data }: { data: ClientPortal }) {
  const toast = useToast();
  const link = typeof window === "undefined" ? "" : referralUrl(data.business.formSlug!, data.client.referralCode);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
          <Heart className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold">Know someone planning a celebration?</p>
          <p className="text-sm text-ink-muted">Send them to {data.business.name}. They&apos;ll know you recommended them.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={whatsappLink(referralMessage({ business: data.business.name, link }))}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: "secondary" })}
        >
          <MessageCircle className="size-4" /> Share on WhatsApp
        </a>
        <button type="button" onClick={copy} className={buttonClass({ variant: "ghost" })}>
          <Copy className="size-4" /> Copy link
        </button>
      </div>
    </Card>
  );
}
