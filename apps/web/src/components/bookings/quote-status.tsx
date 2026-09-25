import type { QuoteStatus } from "@wedding-yantra/types";
import { QUOTE_STATUS_LABELS } from "@wedding-yantra/types";
import { cn } from "@/lib/cn";

export function QuoteStatusPill({ status, expired }: { status: QuoteStatus; expired?: boolean }) {
  const label = expired ? "Expired" : QUOTE_STATUS_LABELS[status];
  const tone = expired
    ? "bg-danger-soft text-danger"
    : status === "accepted"
      ? "bg-success-soft text-success"
      : status === "sent"
        ? "bg-cream text-brand-strong ring-1 ring-sun-300/60"
        : status === "declined"
          ? "bg-cream text-ink-muted"
          : "bg-cream text-ink";
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{label}</span>;
}
