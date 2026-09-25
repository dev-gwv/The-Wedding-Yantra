"use client";

import { computeQuoteTotals, formatMoney, localISODate } from "@wedding-yantra/core";
import { useCatalogue, useCreateQuote, useUpdateQuote, useWorkspace } from "@wedding-yantra/api-client/react";
import {
  GST_RATES,
  quoteInput,
  SERVICE_UNITS,
  UNIT_LABELS,
  updateQuoteInput,
  type CatalogueItem,
  type Quote,
  type ServiceUnit,
} from "@wedding-yantra/types";
import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

interface Line {
  key: string;
  catalogueItemId: string | null;
  name: string;
  unit: ServiceUnit;
  quantity: string;
  rate: string;
  taxRate: number;
}

let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

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
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState(quote?.title ?? defaultTitle ?? "");
  const [lines, setLines] = useState<Line[]>(
    () =>
      quote?.items.map((i) => ({
        key: nextKey(),
        catalogueItemId: i.catalogueItemId,
        name: i.name,
        unit: i.unit,
        quantity: String(i.quantity),
        rate: String(i.rate),
        taxRate: i.taxRate,
      })) ?? [],
  );
  const [discount, setDiscount] = useState(quote && quote.discount > 0 ? String(quote.discount) : "");
  const [validUntil, setValidUntil] = useState(() => (quote ? (quote.validUntil ?? "") : localISODate(new Date(), 30)));
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [terms, setTerms] = useState<string | null>(quote ? (quote.terms ?? "") : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // New quotes start with the business's usual terms once they load.
  const shownTerms = terms ?? details.data?.quoteTerms ?? "";

  const numeric = lines.map((l) => ({ quantity: Number(l.quantity) || 0, rate: Number(l.rate) || 0, taxRate: l.taxRate }));
  const totals = computeQuoteTotals(numeric, Number(discount) || 0);

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function addFromCatalogue(item: CatalogueItem) {
    setLines((ls) => [
      ...ls,
      { key: nextKey(), catalogueItemId: item.id, name: item.name, unit: item.unit, quantity: "1", rate: String(item.price), taxRate: item.taxRate },
    ]);
    setPicking(false);
  }

  function addCustom() {
    setLines((ls) => [...ls, { key: nextKey(), catalogueItemId: null, name: "", unit: "event", quantity: "1", rate: "", taxRate: 0 }]);
    setPicking(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const items = lines.map((l) => ({
      catalogueItemId: l.catalogueItemId,
      name: l.name,
      unit: l.unit,
      quantity: l.quantity,
      rate: l.rate || "0",
      taxRate: l.taxRate,
    }));
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

  const lineError = (i: number) => Object.entries(errors).find(([k]) => k.startsWith(`items.${i}.`))?.[1];

  return (
    <form onSubmit={submit} className="space-y-6 pb-28" noValidate>
      <TextField label="Quote title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Wedding makeup, 3 functions" />

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">Services</h2>
        <div className="space-y-3">
          {lines.map((line, i) => (
            <Card key={line.key} className="p-4">
              <div className="flex items-start gap-2">
                <input
                  value={line.name}
                  onChange={(e) => setLine(line.key, { name: e.target.value })}
                  placeholder="Service name"
                  aria-label={`Line ${i + 1} name`}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-line px-3 text-[15px] font-semibold focus:border-sun-300 focus:shadow-glow focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                  className="rounded-xl p-3 text-ink-muted hover:bg-danger-soft hover:text-danger"
                  aria-label={`Remove line ${i + 1}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-xs font-semibold text-ink-muted">
                  Qty
                  <input
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => setLine(line.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                    className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-[15px] font-semibold text-ink tabular focus:border-sun-300 focus:shadow-glow focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-ink-muted">
                  Rate (₹)
                  <input
                    inputMode="decimal"
                    value={line.rate}
                    onChange={(e) => setLine(line.key, { rate: e.target.value.replace(/[^\d.]/g, "") })}
                    className="mt-1 h-11 w-full rounded-xl border border-line px-3 text-[15px] font-semibold text-ink tabular focus:border-sun-300 focus:shadow-glow focus:outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-ink-muted">
                  Unit
                  <select
                    value={line.unit}
                    onChange={(e) => setLine(line.key, { unit: e.target.value as ServiceUnit })}
                    className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold text-ink focus:border-sun-300 focus:outline-none"
                  >
                    {SERVICE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABELS[u]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-muted">
                  GST
                  <select
                    value={line.taxRate}
                    onChange={(e) => setLine(line.key, { taxRate: Number(e.target.value) })}
                    className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold text-ink focus:border-sun-300 focus:outline-none"
                  >
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r === 0 ? "No GST" : `${r}%`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-danger">{lineError(i)}</span>
                <span className="font-bold tabular">{formatMoney(totals.lineAmounts[i] ?? 0, { paise: (totals.lineAmounts[i] ?? 0) % 1 !== 0 })}</span>
              </div>
            </Card>
          ))}
        </div>
        {errors.items && <p className="mt-2 text-sm text-danger">{errors.items}</p>}
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setPicking(true)}>
          <Plus className="size-4" strokeWidth={2.5} /> Add a service
        </Button>
      </section>

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

      <CataloguePicker open={picking} onClose={() => setPicking(false)} onPick={addFromCatalogue} onCustom={addCustom} />
    </form>
  );
}

function CataloguePicker({
  open,
  onClose,
  onPick,
  onCustom,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: CatalogueItem) => void;
  onCustom: () => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const items = useCatalogue(workspace.id);
  return (
    <Sheet open={open} onClose={onClose} title="Add a service" description="From your price list, or a one-off line.">
      {items.isPending && (
        <div className="flex justify-center py-6 text-brand">
          <Spinner />
        </div>
      )}
      <ul className="-mx-2 max-h-[50dvh] space-y-1 overflow-y-auto">
        {items.data?.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className={cn("flex w-full items-baseline justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-cream")}
            >
              <span className="font-semibold">{item.name}</span>
              <span className="shrink-0 text-sm text-ink-muted tabular">
                <span className="font-bold text-ink">{formatMoney(item.price)}</span> {UNIT_LABELS[item.unit]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="lg" className="mt-4" onClick={onCustom}>
        <Plus className="size-4" /> A one-off line
      </Button>
    </Sheet>
  );
}
