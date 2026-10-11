"use client";

import { timeAgo } from "@wedding-yantra/core";
import { useMetaRecent } from "@wedding-yantra/api-client/react";
import type { IncomingLeadItem, MetaPage } from "@wedding-yantra/types";
import { ChevronRight, Inbox, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { Chip, errorKindText, FINAL_ERROR_KINDS, INCOMING_STATUS } from "./chips";
import type { MetaActions } from "./use-meta-actions";

function Row({ item, retry, retrying }: { item: IncomingLeadItem; retry: (() => void) | null; retrying: boolean }) {
  const status = INCOMING_STATUS[item.status];
  const why = item.status === "failed" || item.status === "queued" ? errorKindText(item.errorKind, item.status === "failed") : null;
  const where = [item.pageName, item.formName].filter(Boolean).join(" · ");
  const inner = (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-words font-semibold">{item.name ?? (item.status === "queued" ? "On its way" : "No name given")}</span>
          {item.isTest && <Chip>Test lead</Chip>}
        </p>
        <Chip tone={status.tone}>{status.label}</Chip>
      </div>
      <p className="mt-0.5 text-sm text-ink-muted">
        {where && `${where} · `}
        {timeAgo(item.receivedAt)}
        {item.receivedVia === "catch_up" && " · picked up later"}
      </p>
      {why && <p className="mt-0.5 text-xs text-ink-muted">{why}</p>}
      {item.status === "failed" && retry && (
        <Button size="sm" variant="secondary" className="mt-2 h-8 px-3" loading={retrying} onClick={retry}>
          <RefreshCw className="size-3.5" /> Try again
        </Button>
      )}
    </div>
  );
  if (item.leadId && item.status !== "failed") {
    return (
      <Link href={`/app/leads/${item.leadId}`} className="flex items-start gap-2 px-5 py-3.5 hover:bg-cream">
        {inner}
        <ChevronRight className="mt-1 size-4 shrink-0 text-ink-subtle" />
      </Link>
    );
  }
  return <div className="flex items-start px-5 py-3.5">{inner}</div>;
}

/** The last leads that came in from Facebook and Instagram, and where each one went. */
export function RecentList({ workspaceId, pages, actions }: { workspaceId: string; pages: MetaPage[]; actions: MetaActions }) {
  const recent = useMetaRecent(workspaceId);

  // "Try again" checks the Page the lead came from, if it's still sending leads here.
  const pageFor = (item: IncomingLeadItem) => pages.find((p) => p.id === item.pageId && p.active) ?? null;
  const retry = (item: IncomingLeadItem) => {
    const page = pageFor(item);
    if (!page || FINAL_ERROR_KINDS.includes(item.errorKind ?? "")) return null;
    return () => void actions.checkPage(page.id);
  };

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">Recent leads</h2>
      <Card className="overflow-hidden">
        {recent.isPending ? (
          <div className="flex justify-center py-10 text-brand">
            <Spinner />
          </div>
        ) : recent.isError ? (
          <div className="p-5">
            <Notice tone="danger">{errorMessage(recent.error)}</Notice>
          </div>
        ) : recent.data.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-5 text-sm text-ink-muted">
            <Inbox className="size-5 shrink-0" />
            No leads yet. Send a test lead to check everything works.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {recent.data.map((item) => (
              <Row
                key={item.id}
                item={item}
                retry={retry(item)}
                retrying={!!actions.checkingId && pageFor(item)?.id === actions.checkingId}
              />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
