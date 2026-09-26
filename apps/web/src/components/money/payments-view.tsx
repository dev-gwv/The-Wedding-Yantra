"use client";

import { formatDate, formatMoney, formatMoneyShort } from "@wedding-yantra/core";
import { usePayments } from "@wedding-yantra/api-client/react";
import type { DueItem, Payment, PaymentListQuery } from "@wedding-yantra/types";
import { ChevronRight, Download, HandCoins, IndianRupee, Receipt, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { OptionIcon, useOptionList } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { billUrl } from "@/lib/links";
import { downloadCsv, periodRange, type Period } from "@/lib/periods";
import { Chips, MoneyTile, PeriodPills, SearchBox } from "./list-kit";
import { PaymentSheet } from "./payment-sheet";

/**
 * Money received, with its receipt number. Filter by period and payment mode, search by
 * name, receipt or reference, and download it for the accountant.
 */
export function PaymentsView() {
  const { workspace } = useCurrentWorkspace();
  const { active } = useOptionList("payment_method");
  const [period, setPeriod] = useState<Period>("month");
  const [method, setMethod] = useState("all");
  const [q, setQ] = useState("");
  const onSearch = useCallback((v: string) => setQ(v), []);
  const base: PaymentListQuery = { ...periodRange(period), ...(q ? { q } : {}) };
  const all = usePayments(workspace.id, base);
  const [open, setOpen] = useState<Payment | null>(null);

  const list = useMemo(() => (all.data ?? []).filter((p) => method === "all" || p.method === method), [all.data, method]);
  const total = list.reduce((a, p) => a + p.amount, 0);
  const byMode = useMemo(() => {
    const m = new Map<string, { label: string; total: number }>();
    for (const p of all.data ?? []) m.set(p.method, { label: p.methodLabel, total: (m.get(p.method)?.total ?? 0) + p.amount });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [all.data]);
  // Modes that have money this period come first, then the rest of the list.
  const modeChips: [string, string][] = [
    ["all", "All modes"],
    ...byMode.map(([key, v]) => [key, v.label] as [string, string]),
    ...active.filter((o) => !byMode.some(([k]) => k === o.key)).map((o) => [o.key, o.label] as [string, string]),
  ];

  function exportList() {
    downloadCsv(
      `payments-${period}.csv`,
      ["Date", "Receipt", "From", "Invoice", "Mode", "Reference", "Amount", "Recorded by"],
      list.map((p) => [p.paidOn, p.number, p.clientName, p.billNumber, p.methodLabel, p.reference, p.amount, p.recordedBy?.name]),
    );
  }

  return (
    <div className="space-y-5">
      <PeriodPills value={period} onChange={setPeriod} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MoneyTile label="Received" value={all.data ? formatMoneyShort(total) : "…"} icon={IndianRupee} tone="success" note={method === "all" ? undefined : "In this mode"} />
        <MoneyTile label="Payments" value={all.data ? String(list.length) : "…"} icon={Receipt} />
        {byMode.slice(0, 2).map(([key, v]) => (
          <MoneyTile
            key={key}
            label={`By ${v.label}`}
            value={formatMoneyShort(v.total)}
            icon={HandCoins}
            active={method === key}
            onClick={() => setMethod((cur) => (cur === key ? "all" : key))}
          />
        ))}
      </div>

      <div className="space-y-3">
        <Chips options={modeChips} value={method} onChange={setMethod} label="Payment mode" />
        <div className="flex gap-2">
          <SearchBox value={q} onChange={onSearch} placeholder="Name, receipt or reference" />
          <Button variant="secondary" onClick={exportList} disabled={!list.length} aria-label="Download as a spreadsheet" title="Download as a spreadsheet">
            <Download className="size-4" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {all.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {all.isError && <Notice tone="danger">{errorMessage(all.error)}</Notice>}
      {all.data && list.length === 0 && (
        <Card>
          <EmptyState icon={IndianRupee} title="No payments here">
            {q || method !== "all" ? "Try another period, mode or search." : "Money you record against invoices and bookings shows here, each with its receipt number."}
          </EmptyState>
        </Card>
      )}
      {list.length > 0 && (
        <>
          <p className="text-sm text-ink-muted">
            {list.length} payment{list.length === 1 ? "" : "s"} · {formatMoney(total)}
          </p>
          <Card className="divide-y divide-line overflow-hidden">
            {list.map((p) => (
              <PaymentListRow key={p.id} payment={p} onClick={() => setOpen(p)} />
            ))}
          </Card>
        </>
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

function PaymentListRow({ payment, onClick }: { payment: Payment; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-cream">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
        <OptionIcon optionKey={payment.method} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{payment.clientName ?? "Payment"}</span>
        <span className="block truncate text-sm text-ink-muted">
          {[formatDate(payment.paidOn, { year: false }), payment.number, payment.methodLabel, payment.billNumber, payment.reference].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="shrink-0 font-bold tabular text-success">{formatMoney(payment.amount, { paise: payment.amount % 1 !== 0 })}</span>
      <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
    </button>
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
                      <span className="block truncate text-sm text-ink-muted">{[d.billNumber ?? "No invoice yet", d.eventTitle].filter(Boolean).join(" · ")}</span>
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

