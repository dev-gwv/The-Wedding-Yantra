"use client";

import { can, formatMoney, formatMoneyShort } from "@wedding-yantra/core";
import { useExpenses, useExpensesSummary } from "@wedding-yantra/api-client/react";
import type { Expense, ExpenseListQuery } from "@wedding-yantra/types";
import { Clock, Plus, ReceiptText, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { useOptionList } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { downloadCsv, rangeDates, type DateRange } from "@/lib/periods";
import { ExpenseRow, ExpenseSheet } from "./expense-sheet";
import { DateRangeButton, SummaryCard, Toolbar } from "./list-kit";

type Who = "all" | "business" | "reimburse";
type Status = "all" | "pending";

/**
 * Money spent. Filter by dates, category and who paid; search by who it went to or their
 * bill number; see what's waiting for approval and what's owed back to the team; download
 * it for the CA. Owners, managers and the accountant see everyone's; the team sees their own.
 * On the Payments and invoices screen the dates come from the top of the page.
 */
export function ExpensesView({
  adding: addingFromHeader,
  onAddingChange,
  range: sharedRange,
}: { adding?: boolean; onAddingChange?: (adding: boolean) => void; range?: DateRange } = {}) {
  const { workspace } = useCurrentWorkspace();
  const seesAll = can(workspace, "finance.view");
  const canAdd = can(workspace, "expenses.submit");
  const { active } = useOptionList("expense_category");
  const [ownRange, setOwnRange] = useState<DateRange>({ period: "month" });
  const range = sharedRange ?? ownRange;
  const [category, setCategory] = useState("all");
  const [who, setWho] = useState<Who>("all");
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const onSearch = useCallback((v: string) => setQ(v), []);
  // Tiles and category totals follow the period, search and who paid, but not the category or
  // status picked, so the other chips keep their numbers.
  const tileQuery: ExpenseListQuery = { ...rangeDates(range), ...(who !== "all" ? { paidBy: who } : {}), ...(q ? { q } : {}) };
  const query: ExpenseListQuery = {
    ...tileQuery,
    ...(category !== "all" ? { category } : {}),
    ...(status !== "all" ? { status } : {}),
  };
  const expenses = useExpenses(workspace.id, query);
  const summary = useExpensesSummary(workspace.id, tileQuery);
  const [addingHere, setAddingHere] = useState(false);
  // The Money screen's header button can open the sheet; otherwise this view's own button does.
  const controlled = onAddingChange !== undefined;
  const adding = controlled ? !!addingFromHeader : addingHere;
  const setAdding = controlled ? onAddingChange : setAddingHere;
  const [open, setOpen] = useState<Expense | null>(null);
  const s = summary.data;
  const byCategory = s?.byCategory ?? [];
  const biggest = byCategory[0]?.total ?? 0;
  const list = expenses.data ?? [];
  const filtered = category !== "all" || who !== "all" || status !== "all" || !!q;

  // Categories with money this period first, then the rest of the list.
  const categoryChips: [string, string][] = [
    ["all", "Any category"],
    ...byCategory.map((c) => [c.category, c.label] as [string, string]),
    ...active.filter((o) => !byCategory.some((c) => c.category === o.key)).map((o) => [o.key, o.label] as [string, string]),
  ];

  function exportList() {
    downloadCsv(
      `expenses-${range.period === "custom" ? `${range.from}-to-${range.to}` : range.period}.csv`,
      ["Date", "Category", "Paid to", "Vendor bill no.", "Amount", "GST rate %", "GST", "Paid with", "Paid by", "Paid back on", "Event", "Status", "Added by", "Note"],
      list.map((x) => [
        x.spentOn,
        x.categoryLabel,
        x.vendorName ?? x.paidTo,
        x.vendorInvoiceNo,
        x.amount,
        x.gstRate,
        x.gstAmount || null,
        x.methodLabel,
        x.paidBy?.name ?? "Business",
        x.reimbursedAt?.slice(0, 10),
        x.eventTitle,
        x.status,
        x.submittedBy?.name,
        x.note,
      ]),
    );
  }

  return (
    <div className="space-y-5">
      {(!sharedRange || (canAdd && !controlled)) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!sharedRange && <DateRangeButton value={range} onChange={setOwnRange} />}
          {canAdd && !controlled && (
            <Button variant="secondary" onClick={() => setAdding(true)} className="w-full sm:w-auto">
              <Plus className="size-4" strokeWidth={2.5} /> Add expense
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          label={seesAll ? "Total spent" : "You spent"}
          value={s ? formatMoney(s.spent) : "…"}
          icon={Wallet}
          note={s ? [`${s.count} expense${s.count === 1 ? "" : "s"} on these dates`, seesAll && s.gst > 0 ? `${formatMoneyShort(s.gst)} GST your CA can claim` : null].filter(Boolean).join(" · ") : undefined}
        />
        <SummaryCard
          label="Waiting for approval"
          value={s ? formatMoney(s.pending) : "…"}
          icon={Clock}
          note={
            s
              ? [
                  s.pendingCount > 0 ? (seesAll ? `${s.pendingCount} to look at` : `${s.pendingCount} sent to the owner`) : "Nothing waiting",
                  s.toReimburse > 0 ? `${formatMoneyShort(s.toReimburse)} ${seesAll ? "to pay back to the team" : "owed back to you"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        />
      </div>

      {seesAll && category === "all" && byCategory.length > 1 && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-ink-muted">Where it went</p>
          <ul className="mt-3 space-y-2.5">
            {byCategory.slice(0, 6).map((c) => (
              <li key={c.category}>
                <button type="button" onClick={() => setCategory(c.category)} className="block w-full text-left text-sm">
                  <span className="flex justify-between gap-3">
                    <span className="font-semibold">{c.label}</span>
                    <span className="tabular text-ink-muted">{formatMoney(c.total)}</span>
                  </span>
                  <span className="mt-1 block h-2 overflow-hidden rounded-full bg-cream">
                    <span className="block h-full rounded-full bg-gradient-primary" style={{ width: `${Math.max(4, (c.total / biggest) * 100)}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Toolbar
        search={q}
        onSearch={onSearch}
        placeholder="Paid to, vendor, bill number or note"
        filters={[
          { label: "Category", options: categoryChips, value: category, onChange: setCategory },
          {
            label: "Who paid",
            options: [
              ["all", "Anyone"],
              ["business", "Business paid"],
              ["reimburse", "To pay back"],
            ],
            value: who,
            onChange: (v) => setWho(v as Who),
          },
          {
            label: "Approval",
            options: [
              ["all", "Any"],
              ["pending", "Waiting for approval"],
            ],
            value: status,
            onChange: (v) => setStatus(v as Status),
          },
        ]}
        onRefresh={() => {
          void expenses.refetch();
          void summary.refetch();
        }}
        refreshing={expenses.isFetching}
        onExport={exportList}
        canExport={list.length > 0}
      />

      {expenses.isPending && (
        <div className="flex justify-center py-12 text-brand">
          <Spinner />
        </div>
      )}
      {expenses.isError && <Notice tone="danger">{errorMessage(expenses.error)}</Notice>}
      {expenses.data && list.length === 0 && (
        <Card>
          <EmptyState icon={ReceiptText} title={filtered ? "No expenses here" : "Nothing spent on these dates"}>
            {filtered
              ? "Try other dates, another filter, or clear the search."
              : canAdd
                ? "Add what you spend on materials, helpers, travel and more, with a photo of the bill. Profit on each event comes from this."
                : "Expenses the team adds show here."}
          </EmptyState>
        </Card>
      )}
      {list.length > 0 && (
        <>
          <p className="text-sm text-ink-muted">
            {list.length} expense{list.length === 1 ? "" : "s"} · {formatMoney(list.filter((x) => x.status !== "rejected").reduce((a, x) => a + x.amount, 0))}
          </p>
          <Card className="divide-y divide-line overflow-hidden">
            {list.map((x) => (
              <ExpenseRow key={x.id} expense={x} onClick={() => setOpen(x)} />
            ))}
          </Card>
        </>
      )}

      <ExpenseSheet open={adding} onClose={() => setAdding(false)} />
      <ExpenseSheet open={!!open} onClose={() => setOpen(null)} expense={open ?? undefined} />
    </div>
  );
}

/** Expenses on an event page: add one, see what's been spent. */
export function EventExpenses({ eventId }: { eventId: string }) {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace, "expenses.submit") || can(workspace, "finance.view");
  const expenses = useExpenses(workspace.id, { eventId }, allowed);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Expense | null>(null);
  if (!allowed) return null;
  const list = expenses.data ?? [];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">Expenses</h2>
        {can(workspace, "expenses.submit") && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" strokeWidth={2.5} /> Add expense
          </Button>
        )}
      </div>
      {list.length > 0 ? (
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((x) => (
            <ExpenseRow key={x.id} expense={x} onClick={() => setOpen(x)} showEvent={false} />
          ))}
        </Card>
      ) : (
        expenses.data && <p className="text-sm text-ink-muted">Nothing spent yet. Add materials, helpers and travel as you go, with a bill photo.</p>
      )}
      <ExpenseSheet open={adding} onClose={() => setAdding(false)} eventId={eventId} />
      <ExpenseSheet open={!!open} onClose={() => setOpen(null)} expense={open ?? undefined} eventId={eventId} />
    </section>
  );
}
