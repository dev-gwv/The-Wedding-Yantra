"use client";

import { LEAD_ANSWER_USE_LABELS, timeAgo, type LeadAnswerUse } from "@wedding-yantra/core";
import type { AdAnswer, AdEnquiry } from "@wedding-yantra/types";
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Card, Pill } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

const usedForLabel = (usedFor: string | null) =>
  usedFor && usedFor in LEAD_ANSWER_USE_LABELS ? LEAD_ANSWER_USE_LABELS[usedFor as LeadAnswerUse] : null;

/** "Instagram · Received 2 hours ago", plus when they filled it in when that was well before. */
function receivedLine(e: AdEnquiry): string {
  const platform = e.platform === "instagram" ? "Instagram" : e.platform === "facebook" ? "Facebook" : null;
  const late = e.submittedAt && new Date(e.receivedAt).getTime() - new Date(e.submittedAt).getTime() > 3_600_000;
  return [platform, `Received ${timeAgo(e.receivedAt)}`, late && e.submittedAt ? `filled in ${timeAgo(e.submittedAt)}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** Every question and its answer, word for word, and the enquiry field it filled. */
function FormAnswers({ answers }: { answers: AdAnswer[] }) {
  if (!answers.length) return <p className="mt-3 text-sm text-ink-muted">No answers came with this form.</p>;
  return (
    <dl className="mt-3 divide-y divide-line rounded-2xl bg-cream px-4 py-1">
      {answers.map((a, i) => {
        const used = usedForLabel(a.usedFor);
        return (
          <div key={`${a.key}-${i}`} className="py-3">
            <dt className="break-words text-sm text-ink-muted">{a.label || a.key}</dt>
            <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {a.value ? (
                <span className="min-w-0 whitespace-pre-line break-words font-semibold">{a.value}</span>
              ) : (
                <span className="text-ink-muted">No answer</span>
              )}
              {used && <span className="text-xs font-semibold text-brand-strong">→ {used}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * One Facebook or Instagram lead form behind a lead: the Page, form, campaign, ad set and ad
 * (names only when Meta shares them), and the form's answers word for word.
 */
export function AdEnquiryCard({ enquiry: e, answersOpen = false }: { enquiry: AdEnquiry; answersOpen?: boolean }) {
  const [open, setOpen] = useState(answersOpen);
  const fromAnAd = !e.isOrganic && !e.isTest;
  const rows: [string, ReactNode][] = [
    ["Page", e.pageName],
    ["Form", e.formName],
    [
      "Campaign",
      e.campaignName ?? (fromAnAd ? <span className="font-normal text-ink-muted">Campaign name not shared</span> : null),
    ],
    ["Ad set", e.adsetName],
    ["Ad", e.adName],
  ];
  const shown = rows.filter((r) => !!r[1]);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">From the ad</h2>
      <p className="mt-0.5 text-sm text-ink-muted">{receivedLine(e)}</p>
      {(e.isTest || e.isOrganic || e.merged) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {e.merged && <Pill tone="brand">Enquired again</Pill>}
          {e.isTest && <Pill>Test lead</Pill>}
          {e.isOrganic && <Pill>Not from an ad</Pill>}
        </div>
      )}
      {shown.length > 0 && (
        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {shown.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</dt>
              <dd className="mt-0.5 break-words font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-5 border-t border-line pt-2">
        <h3>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg text-left font-bold"
          >
            <span>
              Form answers <span className="text-sm font-semibold text-ink-muted">· {e.answers.length}</span>
            </span>
            <ChevronDown className={cn("size-5 shrink-0 text-ink-muted transition", open && "rotate-180")} />
          </button>
        </h3>
        {open && <FormAnswers answers={e.answers} />}
      </div>
    </Card>
  );
}
