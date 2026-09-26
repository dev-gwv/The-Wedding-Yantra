"use client";

import { TASK_PRIORITY_INFO, TASK_STATUS_INFO, type TaskStatus } from "@wedding-yantra/core";
import type { TaskPriority } from "@wedding-yantra/types";
import { CircleDashed, CircleDot, CircleCheck, CirclePause, Eye, Flag, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export const STATUS_STYLE: Record<TaskStatus, { tone: string; icon: LucideIcon; bar: string }> = {
  open: { tone: "bg-cream text-ink-muted", icon: CircleDashed, bar: "bg-line-strong" },
  doing: { tone: "bg-sun-50 text-brand-strong", icon: CircleDot, bar: "bg-brand" },
  waiting: { tone: "bg-warning-soft text-warning", icon: CirclePause, bar: "bg-warning" },
  review: { tone: "bg-[#EEF2FF] text-[#4338CA]", icon: Eye, bar: "bg-[#6366F1]" },
  done: { tone: "bg-success-soft text-success", icon: CircleCheck, bar: "bg-success" },
  cancelled: { tone: "bg-cream text-ink-subtle", icon: XCircle, bar: "bg-line" },
};

export function StatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", s.tone, className)}>
      <Icon className="size-3.5" /> {TASK_STATUS_INFO[status].short}
    </span>
  );
}

const PRIORITY_TONE: Record<TaskPriority, string> = {
  urgent: "text-danger",
  high: "text-brand-strong",
  normal: "text-ink-muted",
  low: "text-ink-subtle",
};

/** Only urgent and high are worth a mark on a card; normal and low stay quiet. */
export function PriorityMark({ priority, always }: { priority: TaskPriority; always?: boolean }) {
  if (!always && (priority === "normal" || priority === "low")) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold", PRIORITY_TONE[priority])}>
      <Flag className="size-3.5" /> {TASK_PRIORITY_INFO[priority].label}
    </span>
  );
}

/** Four levels as pills. */
export function PriorityPicker({ value, onChange, disabled }: { value: TaskPriority; onChange: (p: TaskPriority) => void; disabled?: boolean }) {
  const order: TaskPriority[] = ["low", "normal", "high", "urgent"];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Priority">
      {order.map((p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition disabled:opacity-60",
            value === p
              ? p === "urgent"
                ? "bg-danger text-on-brand"
                : "bg-gradient-primary text-on-brand shadow-soft"
              : "border border-line bg-surface text-ink hover:bg-cream",
          )}
        >
          {(p === "urgent" || p === "high") && <Flag className="size-3.5" />}
          {TASK_PRIORITY_INFO[p].label}
        </button>
      ))}
    </div>
  );
}
