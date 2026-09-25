import { PAY_STATE_LABELS, type BillSummary } from "@wedding-yantra/types";
import { cn } from "@/lib/cn";

/** Paid, Part paid, Unpaid, Overdue or Cancelled, in one small pill. */
export function BillStatusPill({ bill }: { bill: Pick<BillSummary, "status" | "payState" | "overdue"> }) {
  const [label, tone] =
    bill.status === "cancelled"
      ? ["Cancelled", "bg-cream text-ink-muted line-through"]
      : bill.overdue
        ? ["Overdue", "bg-danger-soft text-danger"]
        : bill.payState === "paid"
          ? [PAY_STATE_LABELS.paid, "bg-success-soft text-success"]
          : bill.payState === "part_paid"
            ? [PAY_STATE_LABELS.part_paid, "bg-cream text-brand-strong ring-1 ring-sun-300/60"]
            : [PAY_STATE_LABELS.unpaid, "bg-cream text-ink"];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{label}</span>;
}
