"use client";

import { can, formatDate, reviewMessage, whatsappLink } from "@wedding-yantra/core";
import { useGrow, useRequestReview } from "@wedding-yantra/api-client/react";
import type { GrowSummary, ReviewAsk } from "@wedding-yantra/types";
import { ChevronRight, Heart, Lock, Megaphone, MessageCircle, Star } from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, IconSquare, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

/** Happy clients bring the next ones: who to ask for a review, and who sends work your way. */
export default function GrowPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "clients.manage");
  const grow = useGrow(workspace.id, allowed);

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Reviews and referrals" subtitle="Happy clients bring the next ones. Ask for a review after every event." />
      {!allowed ? (
        <Card>
          <EmptyState icon={Lock} title="This is for the owner and managers">
            They ask clients for reviews and see who refers new work.
          </EmptyState>
        </Card>
      ) : grow.isPending ? (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      ) : grow.isError ? (
        <Notice tone="danger">{errorMessage(grow.error)}</Notice>
      ) : (
        <Grow data={grow.data} />
      )}
    </>
  );
}

function Grow({ data }: { data: GrowSummary }) {
  const { referrals } = data;
  return (
    <div className="space-y-8">
      <Link href="/app/messages" className="flex items-center gap-4 rounded-3xl border border-sun-300/60 bg-gradient-to-br from-cream to-surface p-5 shadow-soft hover:border-sun-300">
        <IconSquare icon={Megaphone} />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Wishes and offers</p>
          <p className="text-sm text-ink-muted">Wish past clients on Diwali or their anniversary, or share a season offer.</p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-subtle" />
      </Link>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-extrabold">Ask for a review</h2>
          {data.askedRecently > 0 && (
            <p className="text-sm text-ink-muted">
              {data.askedRecently} asked in the last 30 days
            </p>
          )}
        </div>
        {!data.reviewUrl ? (
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <IconSquare icon={Star} />
            <p className="min-w-0 flex-1 text-sm text-ink-muted">
              Add your Google review link to your business profile first. Then each finished event is one tap away from a review.
            </p>
            <ButtonLink href="/app/settings/business#reviews" variant="secondary" size="sm" className="shrink-0">
              Add review link
            </ButtonLink>
          </Card>
        ) : data.toAsk.length === 0 ? (
          <Card>
            <EmptyState icon={Star} title="Nobody to ask right now">
              Events show up here the day after they end, for 60 days.
            </EmptyState>
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {data.toAsk.map((a) => (
              <AskRow key={a.eventId} ask={a} reviewUrl={data.reviewUrl!} />
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-extrabold">Referrals</h2>
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-sm text-ink-muted">Enquiries from referrals</p>
            <p className="font-display text-3xl font-extrabold tabular">{referrals.enquiries}</p>
            <p className="text-xs text-ink-muted">Last 12 months</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-ink-muted">Of those, booked</p>
            <p className="font-display text-3xl font-extrabold tabular">{referrals.booked}</p>
            <p className="text-xs text-ink-muted">
              {referrals.enquiries > 0 ? `${Math.round((referrals.booked / referrals.enquiries) * 100)}% booked` : "Last 12 months"}
            </p>
          </Card>
        </div>

        {referrals.top.length > 0 ? (
          <>
            <h3 className="mb-2 mt-6 font-bold">Clients who send you work</h3>
            <Card className="divide-y divide-line overflow-hidden">
              {referrals.top.map((r) => (
                <Link key={r.clientId} href={`/app/clients/${r.clientId}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream">
                  <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                  <span className="shrink-0 text-sm text-ink-muted tabular">
                    {r.enquiries} {r.enquiries === 1 ? "enquiry" : "enquiries"}
                    {r.booked > 0 && <span className="font-semibold text-success"> · {r.booked} booked</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              ))}
            </Card>
          </>
        ) : null}

        <Card className="mt-4 flex items-start gap-4 p-5">
          <IconSquare icon={Heart} />
          <p className="min-w-0 text-sm text-ink-muted">
            Share each client&apos;s own page from their client screen. It has a &ldquo;recommend us&rdquo; link, and enquiries through it are
            credited to them by themselves. You can also pick the client when you add an enquiry that came from a referral.
          </p>
        </Card>
      </section>
    </div>
  );
}

function AskRow({ ask, reviewUrl }: { ask: ReviewAsk; reviewUrl: string }) {
  const { workspace } = useCurrentWorkspace();
  const request = useRequestReview(workspace.id);
  const toast = useToast();
  const message = reviewMessage({ clientName: ask.clientName ?? "there", business: workspace.name, link: reviewUrl });

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <Link href={`/app/events/${ask.eventId}`} className="min-w-48 flex-1 hover:text-brand-strong">
        <p className="font-bold">{ask.clientName}</p>
        <p className="text-sm text-ink-muted">
          {ask.title}
          {ask.endDate && ` · ${formatDate(ask.endDate, { year: false })}`}
        </p>
      </Link>
      <a
        href={whatsappLink(message, ask.clientPhone ?? undefined)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass({ size: "sm" })}
        onClick={() =>
          request.mutate(ask.eventId, {
            onSuccess: () => toast(`Noted: asked ${ask.clientName?.split(" ")[0] ?? "them"}`),
            onError: (err) => toast(errorMessage(err), "error"),
          })
        }
      >
        <MessageCircle className="size-4" /> Ask on WhatsApp
      </a>
    </div>
  );
}
