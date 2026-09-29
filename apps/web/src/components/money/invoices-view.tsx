"use client";

import { formatDate, formatMoney, formatPhone } from "@wedding-yantra/core";
import { useBills, useBillsSummary } from "@wedding-yantra/api-client/react";
import { PAY_STATE_LABELS, type BillListQuery, type BillSummary } from "@wedding-yantra/types";
import { FileText, Plus, ReceiptIndianRupee, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { downloadCsv, rangeDates, type DateRange } from "@/lib/periods";
import { BillStatusPill } from "./bill-status";
import { MoneyTable, SummaryCard, tableDate, Toolbar, type Column } from "./list-kit";
import { ClientCell, ForCell } from "./payments-view";
import { withoutName } from "./rows";

type Status = "all" | "paid" | "part_paid" | "unpaid" | "overdue" | "cancelled";
const STATUSES: [Status, string][] = [
  ["all", "Any status"],
  ["paid", "Paid"],
  ["part_paid", "Part paid"],
  ["unpaid", "Unpaid"],
  ["overdue", "Overdue"],
  ["cancelled", "Cancelled"],
];

const statusText = (b: BillSummary) => (b.status === "cancelled" ? "Cancelled" : b.overdue ? "Overdue" : PAY_STATE_LABELS[b.payState]);

/** Invoices issued on the chosen dates: what was invoiced and what's still unpaid on them. */
export function InvoicesView({ range }: { range: DateRange }) {
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const onSearch = useCallback((v: string) => setQ(v), []);
  const base: BillListQuery = { ...rangeDates(range), ...(q ? { q } : {}) };
  // Cancelled ones come from the server only when asked for; the rest are narrowed here.
  const bills = useBills(workspace.id, status === "cancelled" ? { ...base, status: "cancelled" } : base);
  const summary = useBillsSummary(workspace.id, base);
  const s = summary.data;

  const list = useMemo(
    () =>
      (bills.data ?? []).filter((b) => {
        if (status === "all" || status === "cancelled") return true;
        if (b.status === "cancelled") return false;
        if (status === "overdue") return b.overdue;
        return b.payState === status;
      }),
    [bills.data, status],
  );

  function exportList() {
    downloadCsv(
      `invoices-${range.period === "custom" ? `${range.from}-to-${range.to}` : range.period}.csv`,
      ["Date", "Invoice", "Client", "Phone", "For", "Due by", "Amount", "Paid", "Balance", "Status"],
      list.map((b) => [b.issueDate, b.number, b.clientName, b.clientPhone, withoutName(b.eventTitle, b.clientName), b.dueDate, b.total, b.received, b.due, statusText(b)]),
    );
  }

  const columns: Column<BillSummary>[] = [
    {
      head: "Date · Invoice",
      cell: (b) => (
        <span className="block whitespace-nowrap">
          {tableDate(b.issueDate)}
          <span className="block text-xs font-semibold text-ink-muted">{b.number}</span>
        </span>
      ),
    },
    { head: "Client", cell: (b) => <ClientCell name={b.clientName} /> },
    { head: "Contact", cell: (b) => <span className="whitespace-nowrap text-ink-muted">{b.clientPhone ? formatPhone(b.clientPhone) : "—"}</span> },
    { head: "For", cell: (b) => <ForCell text={withoutName(b.eventTitle, b.clientName) ?? "—"} sub={b.dueDate && b.due > 0 ? `Due by ${formatDate(b.dueDate, { year: false })}` : null} /> },
    { head: "Amount", align: "right", cell: (b) => <span className="font-bold">{formatMoney(b.total)}</span> },
    { head: "Balance", align: "right", cell: (b) => <span className={b.overdue ? "font-bold text-danger" : b.due > 0 ? "font-semibold" : "text-ink-muted"}>{formatMoney(b.due)}</span> },
    { head: "Status", cell: (b) => <BillStatusPill bill={b} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          label="Total invoiced"
          value={s ? formatMoney(s.total) : "…"}
          icon={FileText}
          note={s ? `${s.count} invoice${s.count === 1 ? "" : "s"} issued on these dates` : undefined}
        />
        <SummaryCard
          label="Unpaid on these invoices"
          value={s ? formatMoney(s.due) : "…"}
          icon={Wallet}
          tone={s && s.overdue > 0 ? "danger" : undefined}
          note={s ? (s.overdue > 0 ? `${formatMoney(s.overdue)} of it is overdue` : s.due > 0 ? "Nothing overdue" : "All paid") : undefined}
        />
      </div>

      <Toolbar
        search={q}
        onSearch={onSearch}
        placeholder="Name, phone, invoice no. or event"
        filters={[{ label: "Status", options: STATUSES, value: status, onChange: (v) => setStatus(v as Status) }]}
        onRefresh={() => {
          void bills.refetch();
          void summary.refetch();
        }}
        refreshing={bills.isFetching}
        onExport={exportList}
        canExport={list.length > 0}
      />

      {bills.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {bills.isError && <Notice tone="danger">{errorMessage(bills.error)}</Notice>}
      {bills.data && list.length === 0 && (
        <Card>
          <EmptyState
            icon={ReceiptIndianRupee}
            title={status === "all" && !q && range.period === "all" ? "No invoices yet" : "No invoices on these dates"}
            action={
              status === "all" && !q ? (
                <ButtonLink href="/app/bills/new">
                  <Plus className="size-4" strokeWidth={2.5} /> New invoice
                </ButtonLink>
              ) : undefined
            }
          >
            {status === "all" && !q
              ? "Try other dates, or make one for a booked event, a client, or someone new. Share it on WhatsApp with a Pay by UPI button."
              : "Try other dates, another status, or clear the search."}
          </EmptyState>
        </Card>
      )}
      {list.length > 0 && (
        <MoneyTable
          label="Invoices"
          rows={list}
          columns={columns}
          rowKey={(b) => b.id}
          onOpen={(b) => router.push(`/app/bills/${b.id}`)}
          mobile={(b) => ({
            title: b.clientName,
            amount: formatMoney(b.status === "cancelled" ? b.total : b.due || b.total),
            sub: [formatDate(b.issueDate, { year: false }), b.number, withoutName(b.eventTitle, b.clientName)].filter(Boolean).join(" · "),
            status: <BillStatusPill bill={b} />,
          })}
        />
      )}
    </div>
  );
}
