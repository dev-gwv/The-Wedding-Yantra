"use client";

import { can, formatMoney, formatMoneyShort } from "@wedding-yantra/core";
import { useExpenseMonth, useExpenses } from "@wedding-yantra/api-client/react";
import type { Expense } from "@wedding-yantra/types";
import { ChevronLeft, ChevronRight, Plus, ReceiptText } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { ExpenseRow, ExpenseSheet } from "./expense-sheet";

const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (m: string) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const shift = (m: string, by: number) => monthOf(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1));

/**
 * Money spent, month by month. Owners, managers and the accountant see everyone's with
 * totals by category; the team sees their own and adds new ones for approval.
 */
export function ExpensesView({ adding: addingFromHeader, onAddingChange }: { adding?: boolean; onAddingChange?: (adding: boolean) => void } = {}) {
  const { workspace } = useCurrentWorkspace();
  const seesAll = can(workspace.role, "finance.view");
  const canAdd = can(workspace.role, "expenses.submit");
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const expenses = useExpenses(workspace.id, { month });
  const summary = useExpenseMonth(workspace.id, month, seesAll);
  const [addingHere, setAddingHere] = useState(false);
  // The Money screen's header button can open the sheet; otherwise this view's own button does.
  const controlled = onAddingChange !== undefined;
  const adding = controlled ? !!addingFromHeader : addingHere;
  const setAdding = controlled ? onAddingChange : setAddingHere;
  const [open, setOpen] = useState<Expense | null>(null);
  const top = summary.data?.byCategory ?? [];
  const biggest = top[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center justify-between gap-1 sm:flex-none">
          <button type="button" onClick={() => setMonth((m) => shift(m, -1))} className="rounded-xl p-2 hover:bg-cream" aria-label="Previous month">
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="whitespace-nowrap px-2 text-center font-display text-lg font-extrabold">{monthLabel(month)}</h2>
          <button type="button" onClick={() => setMonth((m) => shift(m, 1))} className="rounded-xl p-2 hover:bg-cream" aria-label="Next month">
            <ChevronRight className="size-5" />
          </button>
        </div>
        {canAdd && !controlled && (
          <Button variant="secondary" onClick={() => setAdding(true)} className="w-full sm:w-auto">
            <Plus className="size-4" strokeWidth={2.5} /> Add expense
          </Button>
        )}
      </div>

      {seesAll && summary.data && (summary.data.spent > 0 || summary.data.pending > 0) && (
        <Card className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink-muted">Spent</p>
              <p className="font-display text-2xl font-extrabold tabular">{formatMoney(summary.data.spent)}</p>
            </div>
            {summary.data.pendingCount > 0 && (
              <p className="text-sm font-semibold text-warning">
                {formatMoneyShort(summary.data.pending)} waiting for approval ({summary.data.pendingCount})
              </p>
            )}
          </div>
          {top.length > 0 && (
            <ul className="mt-4 space-y-2.5">
              {top.slice(0, 6).map((c) => (
                <li key={c.category} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold">{c.label}</span>
                    <span className="tabular text-ink-muted">{formatMoney(c.total)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream">
                    <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${Math.max(4, (c.total / biggest) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {expenses.isPending && (
        <div className="flex justify-center py-12 text-brand">
          <Spinner />
        </div>
      )}
      {expenses.isError && <Notice tone="danger">{errorMessage(expenses.error)}</Notice>}
      {expenses.data && expenses.data.length === 0 && (
        <Card>
          <EmptyState icon={ReceiptText} title="Nothing spent this month">
            {canAdd
              ? "Add what you spend on materials, helpers, travel and more, with a photo of the bill. Profit on each event comes from this."
              : "Expenses the team adds show here."}
          </EmptyState>
        </Card>
      )}
      {expenses.data && expenses.data.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {expenses.data.map((x) => (
            <ExpenseRow key={x.id} expense={x} onClick={() => setOpen(x)} />
          ))}
        </Card>
      )}

      <ExpenseSheet open={adding} onClose={() => setAdding(false)} />
      <ExpenseSheet open={!!open} onClose={() => setOpen(null)} expense={open ?? undefined} />
    </div>
  );
}

/** Expenses on an event page: add one, see what's been spent. */
export function EventExpenses({ eventId }: { eventId: string }) {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "expenses.submit") || can(workspace.role, "finance.view");
  const expenses = useExpenses(workspace.id, { eventId }, allowed);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Expense | null>(null);
  if (!allowed) return null;
  const list = expenses.data ?? [];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">Expenses</h2>
        {can(workspace.role, "expenses.submit") && (
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
