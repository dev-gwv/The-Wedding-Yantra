"use client";

import { can, eventIsOver, formatDate, reviewMessage, todayIn, whatsappLink } from "@wedding-yantra/core";
import { useRequestReview, useWorkspace } from "@wedding-yantra/api-client/react";
import type { WeddingEvent } from "@wedding-yantra/types";
import { MessageCircle, Star } from "lucide-react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, GradientTile, IconSquare, NextStepCard } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";
import { useBusinessDay } from "@/lib/today";

/**
 * Once an event is over, one tap asks the client for a review on WhatsApp. The app
 * remembers that you asked, so nobody asks twice by mistake.
 */
export function ReviewCard({ event }: { event: WeddingEvent }) {
  const { workspace } = useCurrentWorkspace();
  const today = useBusinessDay();
  const allowed = can(workspace.role, "clients.manage");
  const details = useWorkspace(allowed ? workspace.id : null);
  const request = useRequestReview(workspace.id);
  const toast = useToast();

  if (!allowed || !event.clientName || !details.data || !eventIsOver(event, today())) return null;
  const first = event.clientName.trim().split(/\s+/)[0];
  const reviewUrl = details.data.reviewUrl;

  if (!reviewUrl) {
    return (
      <Card className="flex items-start gap-4 p-5">
        <IconSquare icon={Star} />
        <div className="min-w-0">
          <p className="font-bold">Ask {first} for a review</p>
          <p className="mt-0.5 text-sm text-ink-muted">Add your Google review link to your business profile, then ask in one tap.</p>
          <ButtonLink href="/app/settings/business#reviews" variant="secondary" size="sm" className="mt-3">
            Add review link
          </ButtonLink>
        </div>
      </Card>
    );
  }

  const link = whatsappLink(reviewMessage({ clientName: event.clientName, business: details.data.name, link: reviewUrl }), event.clientPhone ?? undefined);
  const ask = () =>
    request.mutate(event.id, {
      onSuccess: () => toast("Noted: review asked"),
      onError: (err) => toast(errorMessage(err), "error"),
    });

  if (event.reviewRequestedAt) {
    return (
      <Card className="flex items-center gap-4 p-4 sm:p-5">
        <IconSquare icon={Star} />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-bold">Review asked</span>
          <span className="text-ink-muted"> on {formatDate(todayIn(workspace.timezone, new Date(event.reviewRequestedAt)), { year: false })}</span>
        </p>
        <a href={link} target="_blank" rel="noopener noreferrer" onClick={ask} className={buttonClass({ variant: "ghost", size: "sm" })}>
          Ask again
        </a>
      </Card>
    );
  }

  return (
    <NextStepCard className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <GradientTile icon={Star} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-extrabold">Ask {first} for a review</p>
        <p className="text-sm text-ink-muted">The event is over. A review now, while it&apos;s fresh, helps the next family choose you.</p>
      </div>
      <a href={link} target="_blank" rel="noopener noreferrer" onClick={ask} className={buttonClass({ className: "shrink-0" })}>
        <MessageCircle className="size-4" /> Ask on WhatsApp
      </a>
    </NextStepCard>
  );
}
