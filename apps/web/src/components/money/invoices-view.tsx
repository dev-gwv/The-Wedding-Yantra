"use client";

import { formatMoney, formatMoneyShort } from "@wedding-yantra/core";
import { useBills, useBillsSummary } from "@wedding-yantra/api-client/react";
import { PAY_STATE_LABELS, type BillListQuery, type DueItem } from "@wedding-yantra/types";
import { AlarmClock, Download, FileText, IndianRupee, Plus, ReceiptIndianRupee, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { billUrl } from "@/lib/links";
import { downloadCsv, periodRange, type Period } from "@/lib/periods";
import { Chips, MoneyTile, PeriodPills, SearchBox } from "./list-kit";
import { PaymentSheet } from "./payment-sheet";
import { BillRow, DueRow } from "./rows";

type Status = "all" | "open" | "overdue" | "paid" | "cancelled";
const STATUSES: [Status, string][] = [
  ["all", "All"],
  ["open", "Unpaid"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
  ["cancelled", "Cancelled"],
];

/**
 * Every invoice, with what came in and what's still out. The tiles answer "how are we
 * doing this year" and double as filters; the strip on top is who to chase today.
 */
export function InvoicesView({ dues }: { dues?: DueItem[] }) {
  const { workspace } = useCurrentWorkspace();
  const [period, setPeriod] = useState<Period>("fy");
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const onSearch = useCallback((v: string) => setQ(v), []);
  const base: BillListQuery = { ...periodRange(period), ...(q ? { q } : {}) };
  const query: BillListQuery = { ...base, ...(status === "all" ? {} : { status }) };
  const bills = useBills(workspace.id, query);
  const summary = useBillsSummary(workspace.id, base);
  const s = summary.data;
  const toggle = (next: Status) => setStatus((cur) => (cur === next ? "all" : next));
  const chasing = status === "all" && !q && (dues?.length ?? 0) > 0;

  function exportList() {
    const rows = (bills.data ?? []).map((b) => [
      b.issueDate,
      b.number,
      b.clientName,
      b.eventTitle,
      b.dueDate,
      b.total,
      b.received,
      b.due,
      b.status === "cancelled" ? "Cancelled" : b.overdue ? "Overdue" : PAY_STATE_LABELS[b.payState],
    ]);
    downloadCsv(`invoices-${period}.csv`, ["Date", "Invoice", "Customer", "Event", "Due by", "Total", "Received", "Balance", "Status"], rows);
  }

  return (
    <div className="space-y-5">
      <PeriodPills value={period} onChange={setPeriod} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyTile label="Invoiced" value={s ? formatMoneyShort(s.total) : "…"} note={s ? `${s.count} invoice${s.count === 1 ? "" : "s"}` : undefined} icon={FileText} />
        <MoneyTile label="Received" value={s ? formatMoneyShort(s.received) : "…"} icon={IndianRupee} tone="success" active={status === "paid"} onClick={() => toggle("paid")} />
        <MoneyTile label="To collect" value={s ? formatMoneyShort(s.due) : "…"} icon={Wallet} active={status === "open"} onClick={() => toggle("open")} />
        <MoneyTile
          label="Overdue"
          value={s ? formatMoneyShort(s.overdue) : "…"}
          icon={AlarmClock}
          tone={s && s.overdue > 0 ? "danger" : undefined}
          active={status === "overdue"}
          onClick={() => toggle("overdue")}
        />
      </div>

      {chasing && <WaitingStrip dues={dues!} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Chips options={STATUSES} value={status} onChange={setStatus} label="Invoice status" />
        <div className="flex flex-1 gap-2 sm:justify-end">
          <SearchBox value={q} onChange={onSearch} placeholder="Name, invoice number or event" />
          <Button variant="secondary" onClick={exportList} disabled={!bills.data?.length} aria-label="Download as a spreadsheet" title="Download as a spreadsheet">
            <Download className="size-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {bills.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {bills.isError && <Notice tone="danger">{errorMessage(bills.error)}</Notice>}
      {bills.data && bills.data.length === 0 && (
        <Card>
          <EmptyState
            icon={ReceiptIndianRupee}
            title={status === "all" && !q && period === "all" ? "No invoices yet" : "No invoices here"}
            action={
              status === "all" && !q ? (
                <ButtonLink href="/app/bills/new">
                  <Plus className="size-4" strokeWidth={2.5} /> New invoice
                </ButtonLink>
              ) : undefined
            }
          >
            {status === "all" && !q
              ? "Make one for anyone: a booked event, a client, or someone new. Share it on WhatsApp with a Pay by UPI button."
              : "Try another period or clear the search."}
          </EmptyState>
        </Card>
      )}
      {bills.data && bills.data.length > 0 && (
        <>
          <p className="text-sm text-ink-muted">
            {bills.data.length} invoice{bills.data.length === 1 ? "" : "s"}
            {status !== "cancelled" &&
              ` · ${formatMoney(bills.data.filter((b) => b.status !== "cancelled").reduce((a, b) => a + b.total, 0))}`}
          </p>
          <Card className="divide-y divide-line overflow-hidden">
            {bills.data.map((b) => (
              <BillRow key={b.id} bill={b} />
            ))}
          </Card>
        </>
      )}
    </div>
  );
}

/** Who owes money right now: invoices with a balance and bookings not invoiced yet. */
function WaitingStrip({ dues }: { dues: DueItem[] }) {
  const [all, setAll] = useState(false);
  const [receiving, setReceiving] = useState<DueItem | null>(null);
  const shown = all ? dues : dues.slice(0, 3);
  const total = dues.reduce((a, d) => a + d.due, 0);
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">Waiting to be paid</h2>
        <span className="text-sm font-semibold text-ink-muted tabular">{formatMoney(total)}</span>
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        {shown.map((d) => (
          <DueRow key={`${d.kind}-${d.billId ?? d.eventId}`} item={d} onReceived={setReceiving} />
        ))}
        {dues.length > 3 && (
          <button type="button" onClick={() => setAll((a) => !a)} className="w-full px-5 py-3 text-sm font-bold text-brand-strong hover:bg-cream">
            {all ? "Show fewer" : `See all ${dues.length}`}
          </button>
        )}
      </Card>
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
    </section>
  );
}
