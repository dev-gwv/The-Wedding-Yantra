"use client";

import { useBroadcast, useDeleteBroadcast, useMarkBroadcastRecipient } from "@wedding-yantra/api-client/react";
import { BROADCAST_AUDIENCE_INFO, broadcastProgress, formatPhone, renderTemplate, whatsappLink } from "@wedding-yantra/core";
import type { BroadcastRecipient } from "@wedding-yantra/types";
import { BellOff, Check, MessageCircle, PartyPopper, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Avatar, Card, Notice, NextStepCard, PageHeader, Pill, ProgressBar } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

export default function MessagePage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const toast = useToast();
  const b = useBroadcast(workspace.id, id);
  const mark = useMarkBroadcastRecipient(workspace.id, id);
  const remove = useDeleteBroadcast(workspace.id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (b.isPending) return <Splash />;
  if (b.isError) return <Notice tone="danger">{errorMessage(b.error)}</Notice>;
  const data = b.data;
  const progress = broadcastProgress(data.counts);
  const pending = data.recipients.filter((r) => !r.sentAt && !r.skippedAt);
  const next = pending[0];
  const textFor = (r: BroadcastRecipient) => renderTemplate(data.message, { name: r.name, business: workspace.name });
  const set = (r: BroadcastRecipient, status: "sent" | "skipped" | "pending", noMoreMessages?: boolean) =>
    mark.mutate(
      { recipientId: r.id, status, ...(noMoreMessages ? { noMoreMessages } : {}) },
      {
        onSuccess: () => noMoreMessages && toast(`${r.name.split(" ")[0]} won't get these again`),
        onError: (err) => toast(errorMessage(err), "error"),
      },
    );

  return (
    <>
      <BackLink href="/app/messages" label="Messages" />
      <PageHeader title={data.title} subtitle={`${BROADCAST_AUDIENCE_INFO[data.audience].label} · ${data.counts.total} ${data.counts.total === 1 ? "person" : "people"}`} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5">
          {next ? (
            <NextStepCard className="space-y-4 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink-muted">
                  {data.counts.sent} of {data.counts.total} sent{data.counts.skipped ? `, ${data.counts.skipped} skipped` : ""}
                </p>
                <p className="text-sm font-bold text-brand-strong">{progress.left} to go</p>
              </div>
              <ProgressBar value={progress.percent} label="Sent so far" />
              <div className="flex items-center gap-3">
                <Avatar name={next.name} />
                <div className="min-w-0">
                  <p className="truncate font-bold">{next.name}</p>
                  <p className="text-sm tabular text-ink-muted">{formatPhone(next.phone)}</p>
                </div>
              </div>
              <a
                href={whatsappLink(textFor(next), next.phone)}
                target="_blank"
                rel="noreferrer"
                onClick={() => set(next, "sent")}
                className={buttonClass({ size: "lg" })}
              >
                <MessageCircle className="size-5" /> Send to {next.name.split(" ")[0]} on WhatsApp
              </a>
              <p className="text-center text-sm text-ink-muted">WhatsApp opens with the message ready. Tap send there, then come back for the next one.</p>
            </NextStepCard>
          ) : (
            <NextStepCard className="flex items-center gap-4 p-5 sm:p-6">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-on-brand">
                <PartyPopper className="size-6" />
              </span>
              <div>
                <p className="font-display text-lg font-extrabold">All done</p>
                <p className="text-sm text-ink-muted">
                  {data.counts.sent} sent{data.counts.skipped ? `, ${data.counts.skipped} skipped` : ""}. Replies come to your WhatsApp as usual.
                </p>
              </div>
            </NextStepCard>
          )}

          <Card className="divide-y divide-line overflow-hidden">
            {data.recipients.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar name={r.name} muted={!!(r.sentAt || r.skippedAt)} className="size-9" />
                <div className={cn("min-w-0 flex-1", !(r.sentAt || r.skippedAt) && "basis-[calc(100%-3rem)] sm:basis-0")}>
                  {r.clientId ? (
                    <Link href={`/app/clients/${r.clientId}`} className="block truncate font-semibold hover:text-brand-strong">
                      {r.name}
                    </Link>
                  ) : r.leadId ? (
                    <Link href={`/app/leads/${r.leadId}`} className="block truncate font-semibold hover:text-brand-strong">
                      {r.name}
                    </Link>
                  ) : (
                    <p className="truncate font-semibold">{r.name}</p>
                  )}
                  <p className="whitespace-nowrap text-sm tabular text-ink-muted">{formatPhone(r.phone)}</p>
                </div>
                {r.sentAt || r.skippedAt ? (
                  <div className="flex items-center gap-1">
                    {r.sentAt ? (
                      <Pill tone="success">
                        <Check className="mr-1 size-3.5" strokeWidth={3} /> Sent
                      </Pill>
                    ) : (
                      <Pill>Skipped</Pill>
                    )}
                    <button type="button" onClick={() => set(r, "pending")} className="rounded-lg p-2 text-ink-muted hover:bg-cream" aria-label={`Undo for ${r.name}`} title="Undo">
                      <RotateCcw className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="ml-12 flex items-center gap-1 sm:ml-0">
                    <a
                      href={whatsappLink(textFor(r), r.phone)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => set(r, "sent")}
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                      aria-label={`Send to ${r.name}`}
                    >
                      <MessageCircle className="size-4" /> Send
                    </a>
                    <Button variant="ghost" size="sm" onClick={() => set(r, "skipped")}>
                      Skip
                    </Button>
                    {r.clientId && (
                      <button
                        type="button"
                        onClick={() => set(r, "skipped", true)}
                        className="rounded-lg p-2 text-ink-muted hover:bg-danger-soft hover:text-danger"
                        aria-label={`Don't send ${r.name} these again`}
                        title="Don't send these again"
                      >
                        <BellOff className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">The message</p>
            <div className="mt-3 whitespace-pre-line rounded-2xl rounded-tl-sm bg-success-soft p-4 text-[15px] leading-relaxed text-ink">
              {next ? textFor(next) : renderTemplate(data.message, { name: data.recipients[0]?.name ?? "", business: workspace.name })}
            </div>
            <p className="mt-3 text-sm text-ink-muted">Each person gets their own first name.</p>
          </Card>
          {confirmDelete ? (
            <Card className="space-y-3 p-5">
              <p className="text-sm">Delete this message and its list? Messages already sent stay on WhatsApp.</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  loading={remove.isPending}
                  onClick={() =>
                    remove.mutate(data.id, {
                      onSuccess: () => {
                        toast("Message deleted");
                        router.push("/app/messages");
                      },
                      onError: (err) => toast(errorMessage(err), "error"),
                    })
                  }
                >
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </div>
            </Card>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm font-bold text-danger hover:underline">
              Delete this message
            </button>
          )}
        </div>
      </div>
    </>
  );
}
