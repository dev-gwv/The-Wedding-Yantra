"use client";

import { formatFollowUp, localISODate } from "@wedding-yantra/core";
import { cn } from "@/lib/cn";

export type FollowUpChoice = "tomorrow" | "3days" | "week" | "pick" | "none";

const LABELS: Record<FollowUpChoice, string> = {
  tomorrow: "Tomorrow",
  "3days": "In 3 days",
  week: "Next week",
  pick: "Pick a date",
  none: "No follow-up",
};

const DAYS: Partial<Record<FollowUpChoice, number>> = { tomorrow: 1, "3days": 3, week: 7 };

/** The follow-up time a choice means: 11 am on that day, in the viewer's time zone. Null for none. */
export function followUpFor(choice: FollowUpChoice | null, pickedDate: string, now: Date = new Date()): string | null {
  if (!choice || choice === "none") return null;
  if (choice === "pick") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pickedDate);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 11, 0, 0, 0).toISOString();
  }
  const days = DAYS[choice] ?? 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 11, 0, 0, 0).toISOString();
}

/**
 * Quick follow-up choices as chips, with a date box for "Pick a date". With `allowNone`, a
 * "No follow-up" chip is shown; without it, tapping the chosen chip again clears it.
 */
export function FollowUpChips({
  value,
  onChange,
  pickedDate,
  onPickedDate,
  allowNone = false,
  label = "Next follow-up",
}: {
  value: FollowUpChoice | null;
  onChange: (choice: FollowUpChoice | null) => void;
  pickedDate: string;
  onPickedDate: (date: string) => void;
  allowNone?: boolean;
  label?: string;
}) {
  const choices: FollowUpChoice[] = ["tomorrow", "3days", "week", "pick", ...(allowNone ? (["none"] as const) : [])];
  const at = followUpFor(value, pickedDate);

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 block text-sm font-semibold text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => {
          const on = value === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on && !allowNone ? null : c)}
              className={cn(
                "h-10 rounded-full px-4 text-sm font-bold transition",
                on ? "bg-gradient-primary text-on-brand shadow-soft" : "border border-line bg-surface text-ink hover:border-sun-300 hover:bg-cream",
              )}
            >
              {LABELS[c]}
            </button>
          );
        })}
      </div>
      {value === "pick" && (
        <input
          type="date"
          aria-label="Follow-up date"
          value={pickedDate}
          min={localISODate(new Date(), 0)}
          onChange={(e) => onPickedDate(e.target.value)}
          className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none"
        />
      )}
      <p className="text-sm text-ink-muted">
        {at ? `Reminder: ${formatFollowUp(at)}` : value === "pick" ? "Pick a day" : allowNone ? "No reminder" : "No reminder. Tap a choice to set one"}
      </p>
    </fieldset>
  );
}
