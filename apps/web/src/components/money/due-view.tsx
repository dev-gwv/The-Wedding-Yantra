"use client";

import { can, formatDate, formatMoney, formatPhone, localISODate } from "@wedding-yantra/core";
import { useMoneyOverview } from "@wedding-yantra/api-client/react";
import type { DueItem } from "@wedding-yantra/types";
import { AlarmClock, IndianRupee, MessageCircle, PartyPopper, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { billUrl } from "@/lib/links";
import { downloadCsv } from "@/lib/periods";
import { MoneyTable, SummaryCard, tableDate, Toolbar, type Column } from "./list-kit";
import { PaymentSheet } from "./payment-sheet";
import { ClientCell, ForCell } from "./payments-view";
import { dueHref, dueReminderLink, withoutName } from "./rows";

type Show = "all" | "overdue" | "soon" | "later" | "not_invoiced";
const SHOW: [Show, string][] = [
  ["all", "All outstanding"],
  ["overdue", "Overdue"],
  ["soon", "Due in the next 7 days"],
  ["later", "Due later"],
  ["not_invoiced", "Not invoiced yet"],
];

type State = "overdue" | "soon" | "later";

/** When the money (or the part of it asked for now) is due. */
const dueBy = (d: DueItem) => d.part?.dueDate ?? d.dueDate;

function stateOf(d: DueItem, today: string, week: string): State {
  if (d.overdue) return "overdue";
  const date = dueBy(d);
  return date !== null && date >= today && date <= week ? "soon" : "later";
}

const STATE_PILL: Record<State, [string, string]> = {
  overdue: ["Overdue", "bg-danger-soft text-danger"],
  soon: ["Due soon", "bg-sun-100 text-brand-strong"],
  later: ["Upcoming", "bg-cream text-ink-muted"],
};

function StatePill({ state }: { state: State }) {
  const [label, tone] = STATE_PILL[state];
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{label}</span>;
}

function NotInvoiced() {
  return <span className="inline-flex whitespace-nowrap rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold text-ink-muted ring-1 ring-line">Not invoiced yet</span>;
}

/**
 * Outstanding: what clients still owe today. Invoices not paid in full, and booked events
 * that have a price but no invoice yet. Not tied to the dates picked: it's always "as of today".
 */
export function DueView() {
  const { workspace } = useCurrentWorkspace();
  const overview = useMoneyOverview(workspace.id, true);
  const router = useRouter();
  const [show, setShow] = useState<Show>("all");
  const [q, setQ] = useState("");
  const onSearch = useCallback((v: string) => setQ(v), []);
  const [receiving, setReceiving] = useState<DueItem | null>(null);
  const canRecord = can(workspace, "payments.record");
  const today = localISODate();
  const week = localISODate(new Date(), 7);

  const dues = overview.data?.dues;
  const list = useMemo(() => {
    const needle = q.toLowerCase();
    const digits = q.replace(/\D/g, "");
    return (dues ?? []).filter((d) => {
      if (show === "not_invoiced" && d.billId) return false;
      if (show !== "all" && show !== "not_invoiced" && stateOf(d, today, week) !== show) return false;
      if (!needle) return true;
      return (
        `${d.clientName} ${d.billNumber ?? ""} ${d.eventTitle ?? ""}`.toLowerCase().includes(needle) ||
        (digits.length >= 3 && (d.clientPhone ?? "").replace(/\D/g, "").includes(digits))
      );
    });
  }, [dues, show, q, today, week]);
  const all = dues ?? [];
  const total = all.reduce((a, d) => a + d.due, 0);
  const overdue = all.filter((d) => d.overdue);
  const overdueTotal = overdue.reduce((a, d) => a + d.due, 0);
  const people = new Set(all.map((d) => d.clientId ?? d.clientName)).size;

  function exportList() {
    downloadCsv(
      "outstanding.csv",
      ["Due date", "Client", "Phone", "For", "Invoice", "Total", "Received", "Balance due", "Status"],
      list.map((d) => [dueBy(d), d.clientName, d.clientPhone, withoutName(d.eventTitle, d.clientName), d.billNumber ?? "Not invoiced yet", d.total, d.received, d.due, STATE_PILL[stateOf(d, today, week)][0]]),
    );
  }

  // In the table the two buttons are icons, with their names on hover and for screen readers.
  const actions = (d: DueItem, compact = false) => (
    <span className="flex gap-2" onClick={(e) => e.stopPropagation()}>
      <a
        href={dueReminderLink(d, workspace.name)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass({ variant: "secondary", size: "sm", className: compact ? "px-2.5" : undefined })}
        title={`Remind ${d.clientName} on WhatsApp`}
        aria-label={compact ? `Remind ${d.clientName} on WhatsApp` : undefined}
      >
        <MessageCircle className="size-4" /> {!compact && "Remind"}
      </a>
      {canRecord && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setReceiving(d)}
          title={`Record a payment from ${d.clientName}`}
          aria-label={compact ? `Record a payment from ${d.clientName}` : undefined}
          className={compact ? "px-2.5" : undefined}
        >
          {compact ? <IndianRupee className="size-4" /> : "Record payment"}
        </Button>
      )}
    </span>
  );

  const columns: Column<DueItem>[] = [
    {
      head: "Due date",
      cell: (d) => {
        const date = dueBy(d);
        return <span className={cn("whitespace-nowrap", d.overdue && "font-semibold text-danger")}>{date ? tableDate(date) : "No date"}</span>;
      },
    },
    { head: "Client", cell: (d) => <ClientCell name={d.clientName} /> },
    { head: "Contact", cell: (d) => <span className="whitespace-nowrap text-ink-muted">{d.clientPhone ? formatPhone(d.clientPhone) : "—"}</span> },
    {
      head: "For",
      cell: (d) => (
        <ForCell
          text={withoutName(d.eventTitle, d.clientName) ?? "Invoice"}
          sub={d.billNumber}
          tag={d.billId ? (d.part ? <span>· {d.part.label}</span> : null) : <NotInvoiced />}
        />
      ),
    },
    {
      head: "Received",
      align: "right",
      cell: (d) => (
        <span className="block text-ink-muted">
          {formatMoney(d.received)}
          <span className="block text-xs">of {formatMoney(d.total)}</span>
        </span>
      ),
    },
    { head: "Balance due", align: "right", cell: (d) => <span className={cn("font-bold", d.overdue && "text-danger")}>{formatMoney(d.due)}</span> },
    { head: "Status", cell: (d) => <StatePill state={stateOf(d, today, week)} /> },
    { head: "Actions", cell: (d) => actions(d, true), className: "w-px" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          label="Total outstanding"
          value={dues ? formatMoney(total) : "…"}
          icon={Wallet}
          note={dues ? `From ${people} client${people === 1 ? "" : "s"}, on ${all.length} invoice${all.length === 1 ? "" : "s"} and booking${all.length === 1 ? "" : "s"}` : undefined}
        />
        <SummaryCard
          label="Overdue"
          value={dues ? formatMoney(overdueTotal) : "…"}
          icon={AlarmClock}
          tone={overdueTotal > 0 ? "danger" : undefined}
          note={overdue.length > 0 ? `${overdue.length} payment${overdue.length === 1 ? "" : "s"} past ${overdue.length === 1 ? "its" : "their"} due date` : "Nothing is past its due date"}
        />
      </div>

      <Toolbar
        search={q}
        onSearch={onSearch}
        placeholder="Name, phone, invoice no. or event"
        filters={[{ label: "Show", options: SHOW, value: show, onChange: (v) => setShow(v as Show) }]}
        onRefresh={() => void overview.refetch()}
        refreshing={overview.isFetching}
        onExport={exportList}
        canExport={list.length > 0}
      />

      {overview.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {overview.isError && <Notice tone="danger">{errorMessage(overview.error)}</Notice>}
      {dues && list.length === 0 && (
        <Card>
          <EmptyState icon={PartyPopper} title={all.length === 0 ? "No outstanding payments" : "Nothing matches"}>
            {all.length === 0 ? "Every invoice and booking is paid in full." : "Try another filter or clear the search."}
          </EmptyState>
        </Card>
      )}
      {list.length > 0 && (
        <MoneyTable
          label="Outstanding payments"
          rows={list}
          columns={columns}
          rowKey={(d) => `${d.kind}-${d.billId ?? d.eventId}`}
          onOpen={(d) => router.push(dueHref(d))}
          mobile={(d) => {
            const date = dueBy(d);
            return {
              title: d.clientName,
              amount: <span className={cn(d.overdue && "text-danger")}>{formatMoney(d.due)}</span>,
              sub: [
                date ? `${d.overdue ? "Was due" : "Due"} ${formatDate(date, { year: false })}` : null,
                withoutName(d.eventTitle, d.clientName),
                d.billNumber ?? "Not invoiced yet",
              ]
                .filter(Boolean)
                .join(" · "),
              status: <StatePill state={stateOf(d, today, week)} />,
              extra: <div className="mt-2.5">{actions(d)}</div>,
            };
          }}
        />
      )}

      <PaymentSheet
        open={!!receiving}
        onClose={() => setReceiving(null)}
        target={receiving?.billId ? { billId: receiving.billId } : { eventId: receiving?.eventId ?? undefined }}
        due={receiving?.due ?? 0}
        who={{
          clientName: receiving?.clientName ?? "",
          clientPhone: receiving?.clientPhone ?? null,
          billLink: receiving?.shareToken ? billUrl(receiving.shareToken) : null,
        }}
      />
    </div>
  );
}
