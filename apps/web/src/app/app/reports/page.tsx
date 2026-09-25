"use client";

import { can, formatMoney, PAYMENT_METHOD_LABELS } from "@wedding-yantra/core";
import { useApi, useMonthReport } from "@wedding-yantra/api-client/react";
import { EXPENSE_CATEGORY_LABELS, SOURCE_LABELS, type ExportKind, type MonthReport } from "@wedding-yantra/types";
import { ChevronLeft, ChevronRight, Download, Lock } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (m: string) =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const shift = (m: string, by: number) => monthOf(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1));
const money = (n: number) => formatMoney(n, { paise: n % 1 !== 0 });

/** A month of the business in plain numbers, and the spreadsheets the CA asks for. */
export default function ReportsPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "finance.view");
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const report = useMonthReport(workspace.id, month, allowed);

  return (
    <>
      <BackLink href="/app/money" label="Money" />
      <PageHeader title="Monthly report" />
      {!allowed ? (
        <Card>
          <EmptyState icon={Lock} title="Reports aren't part of your role">
            The owner, managers and the accountant see the monthly report.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-1 sm:justify-start">
            <button type="button" onClick={() => setMonth((m) => shift(m, -1))} className="rounded-xl p-2 hover:bg-cream" aria-label="Previous month">
              <ChevronLeft className="size-5" />
            </button>
            <h2 className="whitespace-nowrap px-2 font-display text-xl font-extrabold">{monthLabel(month)}</h2>
            <button type="button" onClick={() => setMonth((m) => shift(m, 1))} className="rounded-xl p-2 hover:bg-cream" aria-label="Next month">
              <ChevronRight className="size-5" />
            </button>
          </div>
          {report.isPending && (
            <div className="flex justify-center py-16 text-brand">
              <Spinner />
            </div>
          )}
          {report.isError && <Notice tone="danger">{errorMessage(report.error)}</Notice>}
          {report.data && <Report r={report.data} />}
          <Exports month={month} />
        </div>
      )}
    </>
  );
}

function Report({ r }: { r: MonthReport }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-bold text-ink-muted">Cash this month</h3>
          <dl className="mt-3 space-y-1.5">
            <Line label="Came in" value={money(r.cash.received)} tone="success" />
            <Line label="Went out" value={money(r.cash.spent)} />
            <Line label="In hand" value={money(r.cash.net)} strong tone={r.cash.net < 0 ? "danger" : undefined} />
          </dl>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-bold text-ink-muted">Profit this month</h3>
          <dl className="mt-3 space-y-1.5">
            <Line label="Billed, before GST" value={money(r.profit.earned)} />
            <Line label="Spent" value={money(r.profit.spent)} />
            <Line label="Profit" value={money(r.profit.profit)} strong tone={r.profit.profit < 0 ? "danger" : "success"} />
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-ink-muted">Bills and GST</h3>
          <span className="text-sm text-ink-muted">
            {r.sales.bills} bill{r.sales.bills === 1 ? "" : "s"}
          </span>
        </div>
        <dl className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          <Line label="Taxable value" value={money(r.sales.taxable)} />
          <Line label="CGST" value={money(r.sales.cgst)} />
          <Line label="SGST" value={money(r.sales.sgst)} />
          <Line label="IGST" value={money(r.sales.igst)} />
          <Line label="GST in all" value={money(r.sales.tax)} strong />
          <Line label="Billed in all" value={money(r.sales.total)} strong />
        </dl>
        <p className="mt-3 text-sm text-ink-muted">
          Still to collect today: <span className="font-semibold text-ink">{money(r.toCollect)}</span>
          {r.overdue > 0 && <span className="text-danger"> ({money(r.overdue)} overdue)</span>}
        </p>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Breakdown
          title="Where the work came from"
          rows={r.bySource.map((s) => ({ label: s.source === "direct" ? "Booked directly" : SOURCE_LABELS[s.source], value: s.taxable, note: `${s.bills} bill${s.bills === 1 ? "" : "s"}` }))}
          empty="Bills made this month show where each booking came from."
        />
        <Breakdown
          title="What sold"
          rows={r.byService.map((s) => ({ label: s.name, value: s.taxable, note: `× ${s.quantity}` }))}
          empty="The services on this month's bills show here."
        />
        <Breakdown
          title="Bookings by team member"
          rows={r.byMember.map((m) => ({ label: m.name, value: m.taxable, note: `${m.bills} bill${m.bills === 1 ? "" : "s"}` }))}
          empty="Whose enquiries turned into bills this month."
        />
        <Breakdown
          title="Spending"
          rows={r.byCategory.map((c) => ({ label: EXPENSE_CATEGORY_LABELS[c.category], value: c.total }))}
          empty="Approved expenses this month show here."
        />
      </div>

      {r.receivedByMethod.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-bold text-ink-muted">Money came in by</h3>
          <dl className="mt-3 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {r.receivedByMethod.map((m) => (
              <Line key={m.method} label={PAYMENT_METHOD_LABELS[m.method]} value={money(m.total)} />
            ))}
          </dl>
        </Card>
      )}
    </>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "success" | "danger" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", strong && "border-t border-line pt-1.5")}>
      <dt className={strong ? "font-bold" : "text-ink-muted"}>{label}</dt>
      <dd
        className={cn(
          "tabular",
          strong ? "font-display text-lg font-extrabold" : "font-semibold",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: { label: string; value: number; note?: string }[]; empty: ReactNode }) {
  const top = rows[0]?.value ?? 0;
  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-ink-muted">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.slice(0, 6).map((row) => (
            <li key={row.label} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate font-semibold">{row.label}</span>
                <span className="shrink-0 tabular text-ink-muted">
                  {formatMoney(row.value)}
                  {row.note && <span className="text-ink-subtle"> · {row.note}</span>}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream">
                <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${top > 0 ? Math.max(4, (row.value / top) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const FILES: { kind: ExportKind; label: string; hint: string }[] = [
  { kind: "bills", label: "Bills", hint: "Sales register with GST" },
  { kind: "payments", label: "Payments", hint: "Money received" },
  { kind: "expenses", label: "Expenses", hint: "Money spent" },
];

/** Spreadsheets for the CA. They open in Excel and Google Sheets. */
function Exports({ month }: { month: string }) {
  const api = useApi();
  const { workspace } = useCurrentWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState<ExportKind | null>(null);

  async function download(kind: ExportKind) {
    setBusy(kind);
    try {
      const file = await api.reports.export(workspace.id, kind, month);
      const url = URL.createObjectURL(new Blob([file.content], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(file.rows === 0 ? "Saved: nothing in this month yet" : `Saved ${file.rows} row${file.rows === 1 ? "" : "s"}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-display text-lg font-extrabold">For your CA</h3>
      <p className="mt-1 text-sm text-ink-muted">This month as spreadsheets. They open in Excel and Google Sheets.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {FILES.map((f) => (
          <Button key={f.kind} variant="secondary" onClick={() => download(f.kind)} loading={busy === f.kind} className="h-auto justify-start py-3 text-left">
            {busy !== f.kind && <Download className="size-4 shrink-0" />}
            <span>
              <span className="block">{f.label}</span>
              <span className="block text-xs font-medium text-ink-muted">{f.hint}</span>
            </span>
          </Button>
        ))}
      </div>
    </Card>
  );
}
