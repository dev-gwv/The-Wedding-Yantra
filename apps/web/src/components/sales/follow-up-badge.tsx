import { formatFollowUp } from "@wedding-yantra/core";
import type { FollowUpState } from "@wedding-yantra/types";
import { BellRing, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

/** Red when overdue, saffron when due today, quiet when later. */
export function FollowUpBadge({ at, state }: { at: string | null; state: FollowUpState }) {
  if (!at || state === "none") return null;
  const tone =
    state === "overdue"
      ? "bg-danger-soft text-danger"
      : state === "today"
        ? "bg-cream text-brand-strong ring-1 ring-sun-300/60"
        : "bg-cream text-ink-muted";
  const Icon = state === "upcoming" ? Clock : BellRing;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>
      <Icon className="size-3.5" />
      {state === "overdue" ? `Overdue · ${formatFollowUp(at)}` : formatFollowUp(at)}
    </span>
  );
}
