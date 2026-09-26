"use client";

import { useBroadcasts } from "@wedding-yantra/api-client/react";
import { BROADCAST_AUDIENCE_INFO, BROADCAST_PRESETS, broadcastProgress, can, formatDate } from "@wedding-yantra/core";
import { ChevronRight, Megaphone, Plus } from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader, ProgressBar } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";

export default function MessagesPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "clients.manage");
  const list = useBroadcasts(workspace.id);

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title="Messages to clients"
        subtitle="Festival wishes, anniversary wishes and offers, sent from your own WhatsApp."
        action={
          allowed && list.data && list.data.length > 0 ? (
            <ButtonLink href="/app/messages/new">
              <Plus className="size-4" strokeWidth={2.5} /> New message
            </ButtonLink>
          ) : undefined
        }
      />
      {!allowed && <Notice>Only the owner or a manager can send messages to clients.</Notice>}
      {allowed && list.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {allowed && list.isError && <Notice tone="danger">{errorMessage(list.error)}</Notice>}
      {list.data && list.data.length === 0 && (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="Stay in touch with past clients"
            action={
              <ButtonLink href="/app/messages/new">
                <Plus className="size-4" strokeWidth={2.5} /> New message
              </ButtonLink>
            }
          >
            Wish them on Diwali or their anniversary, or share a wedding season offer. Happy clients book again and send their friends.
          </EmptyState>
          <div className="flex flex-wrap justify-center gap-2 px-6 pb-8">
            {BROADCAST_PRESETS.slice(0, 6).map((p) => (
              <Link key={p.id} href={`/app/messages/new?preset=${p.id}`} className="inline-flex h-9 items-center rounded-full bg-cream px-3.5 text-sm font-bold text-ink hover:bg-sun-100">
                {p.label}
              </Link>
            ))}
          </div>
        </Card>
      )}
      {list.data && list.data.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {list.data.map((b) => {
            const p = broadcastProgress(b.counts);
            return (
              <Link key={b.id} href={`/app/messages/${b.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-cream">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="truncate font-bold">{b.title}</p>
                    <p className="text-sm text-ink-muted">{formatDate(b.createdAt.slice(0, 10))}</p>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {BROADCAST_AUDIENCE_INFO[b.audience].label} · {p.left === 0 ? "All done" : `${b.counts.sent} of ${b.counts.total} sent`}
                  </p>
                  <ProgressBar value={p.percent} label={`${b.title}: ${p.done} of ${b.counts.total} done`} />
                </div>
                <ChevronRight className="size-5 shrink-0 text-ink-subtle" />
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
