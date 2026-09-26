"use client";

import { can, formatDate, formatMoney, reminderMessage, whatsappLink } from "@wedding-yantra/core";
import type { BillSummary, DueItem } from "@wedding-yantra/types";
import { ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { billUrl } from "@/lib/links";
import { BillStatusPill } from "./bill-status";

/** Event titles made from a lead start with the client's name; drop it where the name is already shown. */
const withoutName = (title: string | null, name: string) =>
  title?.startsWith(`${name} · `) ? title.slice(name.length + 3) : title;

/** One bill in a list. */
export function BillRow({ bill, showClient = true }: { bill: BillSummary; showClient?: boolean }) {
  return (
    <Link href={`/app/bills/${bill.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-cream">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{showClient ? bill.clientName : bill.number}</span>
        <span className="block truncate text-sm text-ink-muted">
          {[showClient ? bill.number : null, showClient ? withoutName(bill.eventTitle, bill.clientName) : bill.eventTitle, formatDate(bill.issueDate, { year: false })]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-bold tabular">{formatMoney(bill.status === "cancelled" ? bill.total : bill.due || bill.total)}</span>
        <BillStatusPill bill={bill} />
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
    </Link>
  );
}

/**
 * Money still to collect: from whom, for what, by when. One tap reminds them on
 * WhatsApp, another records the money when it comes.
 */
export function DueRow({ item, onReceived }: { item: DueItem; onReceived?: (item: DueItem) => void }) {
  const { workspace } = useCurrentWorkspace();
  const href = item.billId ? `/app/bills/${item.billId}` : `/app/events/${item.eventId}`;
  const forWhat = item.eventTitle ?? (item.billNumber ? `invoice ${item.billNumber}` : "your booking");
  const reminder = whatsappLink(
    reminderMessage({
      clientName: item.clientName,
      business: workspace.name,
      due: item.part?.amount ?? item.due,
      forWhat,
      dueDate: item.part ? item.part.dueDate : item.dueDate,
      part: item.part?.label,
      link: item.shareToken ? billUrl(item.shareToken) : null,
      payOnline: false,
    }),
    item.clientPhone ?? undefined,
  );
  return (
    <div className="px-5 py-4">
      <Link href={href} className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{item.clientName}</span>
          <span className="block truncate text-sm text-ink-muted">
            {item.billNumber ? `${item.billNumber} · ` : "No invoice yet · "}
            {withoutName(item.eventTitle, item.clientName) ?? "Invoice"}
          </span>
          {item.part && (
            <span className={cn("mt-0.5 block text-sm font-semibold", item.overdue ? "text-danger" : "text-ink-muted")}>
              {item.part.label}: {formatMoney(item.part.amount)}
              {item.part.dueDate ? ` ${item.overdue ? "was due" : "due by"} ${formatDate(item.part.dueDate, { year: false })}` : ""}
            </span>
          )}
          {!item.part && item.dueDate && (
            <span className={cn("mt-0.5 block text-sm font-semibold", item.overdue ? "text-danger" : "text-ink-muted")}>
              {item.overdue ? `Was due ${formatDate(item.dueDate, { year: false })}` : `Due by ${formatDate(item.dueDate, { year: false })}`}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className={cn("block font-display text-lg font-extrabold tabular", item.overdue && "text-danger")}>{formatMoney(item.due)}</span>
          {item.received > 0 && <span className="block text-xs text-ink-muted tabular">of {formatMoney(item.total)}</span>}
        </span>
      </Link>
      <div className="mt-3 flex gap-2">
        <a href={reminder} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
          <MessageCircle className="size-4" /> Remind
        </a>
        {onReceived && can(workspace.role, "payments.record") && (
          <Button variant="secondary" size="sm" onClick={() => onReceived(item)}>
            Money received
          </Button>
        )}
      </div>
    </div>
  );
}
