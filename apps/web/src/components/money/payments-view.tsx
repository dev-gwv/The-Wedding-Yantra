"use client";

import { formatDate, formatMoney, formatMoneyShort, formatPhone } from "@wedding-yantra/core";
import { usePayments } from "@wedding-yantra/api-client/react";
import type { DueItem, Payment, PaymentListQuery } from "@wedding-yantra/types";
import { IndianRupee, Receipt, Search } from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useOptionList } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Card, EmptyState, Notice, Pill } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { billUrl } from "@/lib/links";
import { downloadCsv, rangeDates, type DateRange } from "@/lib/periods";
import { MoneyTable, SummaryCard, tableDate, Toolbar, type Column } from "./list-kit";
import { PaymentSheet } from "./payment-sheet";
import { withoutName } from "./rows";

/**
 * Received: every rupee that came in on the chosen dates, with or without an invoice. Like a
 * transactions page: two numbers, a search, a filter by payment mode, and one plain table.
 */
export function PaymentsView({ range }: { range: DateRange }) {
  const { workspace } = useCurrentWorkspace();
  const { active } = useOptionList("payment_method");
  const [method, setMethod] = useState("all");
  const [q, setQ] = useState("");
  const onSearch = useCallback((v: string) => setQ(v), []);
  const base: PaymentListQuery = { ...rangeDates(range), ...(q ? { q } : {}) };
  const all = usePayments(workspace.id, base);
  const [open, setOpen] = useState<Payment | null>(null);

  const list = useMemo(() => (all.data ?? []).filter((p) => method === "all" || p.method === method), [all.data, method]);
  const total = list.reduce((a, p) => a + p.amount, 0);
  const byMode = useMemo(() => {
    const m = new Map<string, { label: string; total: number }>();
    for (const p of list) m.set(p.method, { label: p.methodLabel, total: (m.get(p.method)?.total ?? 0) + p.amount });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [list]);
  const modes: [string, string][] = [["all", "Any mode"], ...active.map((o) => [o.key, o.label] as [string, string])];

  function exportList() {
    downloadCsv(
      `received-${range.period === "custom" ? `${range.from}-to-${range.to}` : range.period}.csv`,
      ["Date", "Client", "Amount", "Phone", "For", "Invoice", "Mode", "Receipt", "Reference", "Recorded by"],
      list.map((p) => [p.paidOn, p.clientName, p.amount, p.clientPhone, forWhat(p), p.billNumber, p.methodLabel, p.number, p.reference, p.recordedBy?.name]),
    );
  }

  const columns: Column<Payment>[] = [
    { head: "Date", cell: (p) => <span className="whitespace-nowrap">{tableDate(p.paidOn)}</span> },
    { head: "Client", cell: (p) => <ClientCell name={p.clientName ?? "Payment"} /> },
    { head: "Amount", align: "right", cell: (p) => <span className="font-bold text-success">{money(p.amount)}</span> },
    { head: "Contact", cell: (p) => <span className="whitespace-nowrap text-ink-muted">{p.clientPhone ? formatPhone(p.clientPhone) : "—"}</span> },
    { head: "For", cell: (p) => <ForCell text={forWhat(p)} sub={p.billNumber} /> },
    { head: "Mode", cell: (p) => <span className="whitespace-nowrap">{p.methodLabel}</span> },
    { head: "Receipt", cell: (p) => <span className="whitespace-nowrap text-ink-muted">{p.number}</span> },
    { head: "Status", cell: () => <Pill tone="success">Received</Pill> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          label="Total received"
          value={all.data ? formatMoney(total) : "…"}
          icon={IndianRupee}
          tone="success"
          note={method === "all" ? "All money in on these dates, advances included" : `Only ${modes.find(([k]) => k === method)?.[1] ?? "this mode"}`}
        />
        <SummaryCard
          label="Number of payments"
          value={all.data ? String(list.length) : "…"}
          icon={Receipt}
          note={byMode.length > 0 ? byMode.slice(0, 3).map((m) => `${m.label} ${formatMoneyShort(m.total)}`).join(" · ") : "Each one has its own receipt number"}
        />
      </div>

      <Toolbar
        search={q}
        onSearch={onSearch}
        placeholder="Name, phone, receipt or event"
        filters={[{ label: "Payment mode", options: modes, value: method, onChange: setMethod }]}
        onRefresh={() => void all.refetch()}
        refreshing={all.isFetching}
        onExport={exportList}
        canExport={list.length > 0}
      />

      {all.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {all.isError && <Notice tone="danger">{errorMessage(all.error)}</Notice>}
      {all.data && list.length === 0 && (
        <Card>
          <EmptyState icon={IndianRupee} title="No payments on these dates">
            {q || method !== "all" ? "Try other dates, another mode, or clear the search." : "Money you record against invoices and bookings shows here, each with its receipt number."}
          </EmptyState>
        </Card>
      )}
      {list.length > 0 && (
        <MoneyTable
          label="Payments received"
          rows={list}
          columns={columns}
          rowKey={(p) => p.id}
          onOpen={setOpen}
          mobile={(p) => ({
            title: p.clientName ?? "Payment",
            amount: <span className="text-success">{money(p.amount)}</span>,
            sub: [formatDate(p.paidOn, { year: false }), p.methodLabel, forWhat(p)].filter(Boolean).join(" · "),
            status: <Pill tone="success">Received</Pill>,
          })}
        />
      )}

      <PaymentSheet
        open={!!open}
        onClose={() => setOpen(null)}
        payment={open ?? undefined}
        due={0}
        who={{ clientName: open?.clientName ?? "", clientPhone: null, billLink: null }}
      />
    </div>
  );
}

const money = (n: number) => formatMoney(n, { paise: n % 1 !== 0 });

/** What a payment was for: its event (without the client's name), or its invoice. */
function forWhat(p: Payment): string {
  return (p.clientName ? withoutName(p.eventTitle, p.clientName) : p.eventTitle) ?? (p.billNumber ? `Invoice ${p.billNumber}` : "Payment");
}

/** The client's name, with a small "View" so it's plain the row opens. */
export function ClientCell({ name }: { name: string }) {
  return (
    <span className="block min-w-0">
      <span className="block max-w-[14rem] truncate font-bold">{name}</span>
      <span className="text-xs font-semibold text-brand-strong">View</span>
    </span>
  );
}

export function ForCell({ text, sub, tag }: { text: string; sub?: string | null; tag?: ReactNode }) {
  return (
    <span className="block min-w-0">
      <span className="block max-w-[14rem] truncate">{text}</span>
      {(sub || tag) && (
        <span className="flex items-center gap-1.5 text-xs text-ink-muted">
          {sub}
          {tag}
        </span>
      )}
    </span>
  );
}

/** "Record payment" from the Money screen: pick who paid from what's owed, then note the money. */
export function RecordPaymentSheet({ open, onClose, dues }: { open: boolean; onClose: () => void; dues: DueItem[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<DueItem | null>(null);
  const shown = dues.filter((d) => !q || `${d.clientName} ${d.billNumber ?? ""} ${d.eventTitle ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Sheet open={open && !picked} onClose={onClose} title="Who paid?">
        <div className="space-y-4">
          <label className="relative block">
            <span className="sr-only">Find</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, invoice or event"
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-[15px] focus:border-sun-300 focus:shadow-glow focus:outline-none"
            />
          </label>
          {dues.length === 0 ? (
            <Notice>Nobody owes you anything right now. For an advance on a booking, open the event or client and record it there.</Notice>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {shown.map((d) => (
                <li key={`${d.kind}-${d.billId ?? d.eventId}`}>
                  <button type="button" onClick={() => setPicked(d)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-cream">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{d.clientName}</span>
                      <span className="block truncate text-sm text-ink-muted">{[d.billNumber ?? "Not invoiced yet", d.eventTitle].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={cn("shrink-0 font-bold tabular", d.overdue && "text-danger")}>{formatMoney(d.due)}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-4 py-3 text-sm text-ink-muted">No one by that name owes money.</li>}
            </ul>
          )}
        </div>
      </Sheet>
      <PaymentSheet
        open={!!picked}
        onClose={() => {
          setPicked(null);
          onClose();
        }}
        target={picked?.billId ? { billId: picked.billId } : { eventId: picked?.eventId ?? undefined }}
        due={picked?.due ?? 0}
        who={{
          clientName: picked?.clientName ?? "",
          clientPhone: picked?.clientPhone ?? null,
          billLink: picked?.shareToken ? billUrl(picked.shareToken) : null,
        }}
      />
    </>
  );
}

