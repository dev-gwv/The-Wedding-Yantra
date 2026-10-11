"use client";

import { LEAD_ANSWER_USE_LABELS, timeAgo, type LeadAnswerUse } from "@wedding-yantra/core";
import type { MetaForm, MetaPage } from "@wedding-yantra/types";
import { ChevronDown, FlaskConical } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Chip, plural } from "./chips";
import { TestLeadPanel, useTestLead } from "./test-lead-card";

const usedForLabel = (usedFor: string | null) =>
  usedFor && usedFor in LEAD_ANSWER_USE_LABELS ? LEAD_ANSWER_USE_LABELS[usedFor as LeadAnswerUse] : null;

/** "How we read this form": each question, and the enquiry field its answer fills. */
function FormReading({ form }: { form: MetaForm }) {
  if (!form.questions.length) {
    return <p className="mt-3 rounded-2xl bg-cream p-4 text-sm text-ink-muted">We&apos;ll see this form&apos;s questions once its first lead comes in.</p>;
  }
  return (
    <div className="mt-3 rounded-2xl bg-cream p-4">
      <ul className="divide-y divide-line">
        {form.questions.map((q) => {
          const label = usedForLabel(q.usedFor);
          return (
            <li key={q.key} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0 text-sm">
              <span className="min-w-0 break-words">{q.label || q.key}</span>
              <span className={cn("shrink-0 text-right font-semibold", label ? "text-brand-strong" : "text-ink-muted")}>
                {label ? `→ ${label}` : "→ Requirements"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">Every answer is also kept on the lead word for word, under Form answers.</p>
    </div>
  );
}

function FormRow({ workspaceId, page, form }: { workspaceId: string; page: MetaPage; form: MetaForm }) {
  const [reading, setReading] = useState(false);
  const test = useTestLead(workspaceId, page, form);
  const archived = !!form.status && form.status !== "ACTIVE";
  const leads = [form.leadsCount > 0 ? plural(form.leadsCount, "lead") : "No leads yet", form.lastLeadAt && `last ${timeAgo(form.lastLeadAt)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-semibold">{form.name}</p>
          <p className="text-sm text-ink-muted">{leads}</p>
        </div>
        {archived && <Chip>{form.status === "ARCHIVED" ? "Archived" : "Not running"}</Chip>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={test.sending} disabled={test.waiting} onClick={() => void test.start()}>
          <FlaskConical className="size-4" /> Send a test lead
        </Button>
        <Button size="sm" variant="ghost" aria-expanded={reading} onClick={() => setReading((r) => !r)}>
          How we read this form <ChevronDown className={cn("size-4 transition", reading && "rotate-180")} />
        </Button>
      </div>
      {reading && <FormReading form={form} />}
      <TestLeadPanel test={test} page={page} form={form} />
    </li>
  );
}

/** The Page's lead forms, each with "How we read this form" and "Send a test lead". */
export function FormList({ workspaceId, page }: { workspaceId: string; page: MetaPage }) {
  return (
    <div>
      <h3 className="text-sm font-bold">Lead forms</h3>
      {page.forms.length ? (
        <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
          {page.forms.map((form) => (
            <FormRow key={form.id} workspaceId={workspaceId} page={page} form={form} />
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-ink-muted">
          No lead forms on this Page yet. Make one in Ads Manager (an Instant Form), then tap Check again.
        </p>
      )}
    </div>
  );
}
