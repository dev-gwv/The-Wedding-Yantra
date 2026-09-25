"use client";

import { computeQuoteTotals, formatMoney, localISODate } from "@wedding-yantra/core";
import { useCreateQuote, useUpdateQuote, useWorkspace } from "@wedding-yantra/api-client/react";
import { quoteInput, updateQuoteInput, type Quote } from "@wedding-yantra/types";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { LineItemsEditor, linesPayload, numericLines, toEditableLines, type EditableLine } from "./line-items";

export function QuoteEditor({
  quote,
  leadId,
  clientId,
  defaultTitle,
  onSaved,
}: {
  /** Editing an existing quote */
  quote?: Quote;
  leadId?: string | null;
  clientId?: string | null;
  defaultTitle?: string;
  onSaved: (quote: Quote) => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const details = useWorkspace(workspace.id);
  const create = useCreateQuote(workspace.id);
  const update = useUpdateQuote(workspace.id, quote?.id ?? "");
  const [title, setTitle] = useState(quote?.title ?? defaultTitle ?? "");
  const [lines, setLines] = useState<EditableLine[]>(() => toEditableLines(quote?.items ?? []));
  const [discount, setDiscount] = useState(quote && quote.discount > 0 ? String(quote.discount) : "");
  const [validUntil, setValidUntil] = useState(() => (quote ? (quote.validUntil ?? "") : localISODate(new Date(), 30)));
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [terms, setTerms] = useState<string | null>(quote ? (quote.terms ?? "") : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // New quotes start with the business's usual terms once they load.
  const shownTerms = terms ?? details.data?.quoteTerms ?? "";

  const totals = computeQuoteTotals(numericLines(lines), Number(discount) || 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const items = linesPayload(lines);
    const payload = { title, items, discount: discount || "0", validUntil, notes, terms: shownTerms };
    const check = quote
      ? validate(updateQuoteInput, payload)
      : validate(quoteInput, { ...payload, leadId: leadId ?? null, clientId: clientId ?? null });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const saved = quote
        ? await update.mutateAsync(payload)
        : await create.mutateAsync({ ...payload, leadId: leadId ?? null, clientId: clientId ?? null });
      onSaved(saved);
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-28" noValidate>
      <TextField label="Quote title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Wedding makeup, 3 functions" />

      <LineItemsEditor lines={lines} onChange={setLines} amounts={totals.lineAmounts} errors={errors} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Discount (₹)"
          inputMode="decimal"
          value={discount}
          onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
          error={errors.discount}
          placeholder="0"
        />
        <TextField label="Valid until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} error={errors.validUntil} />
      </div>
      <TextAreaField label="Note for the client" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} placeholder="Includes trial session and touch-up kit" />
      <TextAreaField label="Terms" rows={4} value={shownTerms} onChange={(e) => setTerms(e.target.value)} error={errors.terms} />

      {(errors._ || errors.leadId) && <Notice tone="danger">{errors._ ?? errors.leadId}</Notice>}

      {/* Totals stay in view while editing */}
      <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-72">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 sm:px-2 lg:px-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-muted">
              {[totals.tax > 0 && `GST ${formatMoney(totals.tax, { paise: true })}`, totals.discount > 0 && `${formatMoney(totals.discount)} off`]
                .filter(Boolean)
                .join(" · ") || "Total"}
            </p>
            <p className="font-display text-2xl font-extrabold tabular">{formatMoney(totals.total, { paise: totals.total % 1 !== 0 })}</p>
          </div>
          <Button type="submit" loading={create.isPending || update.isPending} className="px-8">
            {quote ? "Save quote" : "Create quote"}
          </Button>
        </div>
      </div>

    </form>
  );
}
