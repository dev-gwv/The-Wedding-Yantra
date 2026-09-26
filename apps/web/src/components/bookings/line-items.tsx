"use client";

import { formatMoney, GST_RATE_CHOICES } from "@wedding-yantra/core";
import { useCatalogue, useCreateCatalogueItem } from "@wedding-yantra/api-client/react";
import { SERVICE_UNITS, UNIT_LABELS, type CatalogueItem, type ServiceUnit } from "@wedding-yantra/types";
import { BookmarkPlus, Check, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

/** One line while it's being edited: numbers stay text so people can type freely. */
export interface EditableLine {
  key: string;
  catalogueItemId: string | null;
  name: string;
  /** A second line under the name: what's included */
  description: string;
  sac: string | null;
  unit: ServiceUnit;
  quantity: string;
  rate: string;
  taxRate: number;
}

let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

export function toEditableLines(
  items: {
    catalogueItemId: string | null;
    name: string;
    description?: string | null;
    sac?: string | null;
    unit: ServiceUnit;
    quantity: number;
    rate: number;
    taxRate: number;
  }[],
): EditableLine[] {
  return items.map((i) => ({
    key: nextKey(),
    catalogueItemId: i.catalogueItemId,
    name: i.name,
    description: i.description ?? "",
    sac: i.sac ?? null,
    unit: i.unit,
    quantity: String(i.quantity),
    rate: String(i.rate),
    taxRate: i.taxRate,
  }));
}

/** For live totals while typing. */
export const numericLines = (lines: EditableLine[]) =>
  lines.map((l) => ({ quantity: Number(l.quantity) || 0, rate: Number(l.rate) || 0, taxRate: l.taxRate }));

/** What gets sent to the API; the shared schema checks it. */
export const linesPayload = (lines: EditableLine[]) =>
  lines.map((l) => ({
    catalogueItemId: l.catalogueItemId,
    name: l.name,
    description: l.description.trim() || null,
    sac: l.sac,
    unit: l.unit,
    quantity: l.quantity,
    rate: l.rate || "0",
    taxRate: l.taxRate,
  }));

const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-line px-3 text-[15px] font-semibold text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none";

/**
 * The services on a quote or invoice: pick from the price list or type a one-off line,
 * then adjust quantity, rate, unit and GST. A one-off line can be saved to the price list.
 */
export function LineItemsEditor({
  lines,
  onChange,
  amounts,
  errors,
  allowGst = true,
  detailed = false,
  title = "Services",
}: {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  /** Worked-out amount of each line, in the same order */
  amounts: number[];
  /** Field errors from the shared schema, keyed like `items.0.name` */
  errors: Record<string, string>;
  /** GST on this document */
  allowGst?: boolean;
  /** Invoices: a description line and the HSN/SAC code on each line */
  detailed?: boolean;
  title?: string;
}) {
  const { workspace } = useCurrentWorkspace();
  const saveItem = useCreateCatalogueItem(workspace.id);
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const setLine = (key: string, patch: Partial<EditableLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const lineError = (i: number) => Object.entries(errors).find(([k]) => k.startsWith(`items.${i}.`))?.[1];

  function addFromCatalogue(item: CatalogueItem) {
    onChange([
      ...lines,
      {
        key: nextKey(),
        catalogueItemId: item.id,
        name: item.name,
        description: item.description ?? "",
        sac: item.sac,
        unit: item.unit,
        quantity: "1",
        rate: String(item.price),
        // On a GST invoice, a service saved without a rate starts at 18%, the usual rate for services.
        taxRate: allowGst ? item.taxRate || 18 : 0,
      },
    ]);
    setPicking(false);
  }

  function addCustom() {
    onChange([
      ...lines,
      { key: nextKey(), catalogueItemId: null, name: "", description: "", sac: null, unit: "event", quantity: "1", rate: "", taxRate: allowGst ? 18 : 0 },
    ]);
    setPicking(false);
  }

  async function saveToPriceList(line: EditableLine) {
    setSaving(line.key);
    try {
      const item = await saveItem.mutateAsync({
        name: line.name,
        description: line.description || null,
        unit: line.unit,
        price: line.rate || "0",
        taxRate: line.taxRate,
        sac: line.sac ?? "",
      });
      setLine(line.key, { catalogueItemId: item.id });
      toast(`${item.name} is on your price list`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(null);
    }
  }

  // Today's GST rates, plus an older rate a line already carries.
  const rateChoices = (current: number) => ([...GST_RATE_CHOICES] as number[]).concat(GST_RATE_CHOICES.includes(current as 0) ? [] : [current]).sort((a, b) => a - b);

  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-extrabold">{title}</h2>
      <div className="space-y-3">
        {lines.map((line, i) => (
          <Card key={line.key} className="p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  value={line.name}
                  onChange={(e) => setLine(line.key, { name: e.target.value })}
                  placeholder="Service name"
                  aria-label={`Line ${i + 1} name`}
                  className="h-11 w-full rounded-xl border border-line px-3 text-[15px] font-semibold focus:border-sun-300 focus:shadow-glow focus:outline-none"
                />
                {detailed && (
                  <textarea
                    value={line.description}
                    onChange={(e) => setLine(line.key, { description: e.target.value })}
                    rows={1}
                    maxLength={300}
                    placeholder="Add a description: what's included, dates, hours"
                    aria-label={`Line ${i + 1} description`}
                    className="block min-h-10 w-full resize-y rounded-xl border border-dashed border-line px-3 py-2 text-sm text-ink-muted focus:border-sun-300 focus:text-ink focus:outline-none"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
                className="rounded-xl p-3 text-ink-muted hover:bg-danger-soft hover:text-danger"
                aria-label={`Remove line ${i + 1}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className={allowGst ? "mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" : "mt-3 grid grid-cols-3 gap-2"}>
              <label className="text-xs font-semibold text-ink-muted">
                Qty
                <input
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => setLine(line.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                  className={`${inputClass} tabular`}
                />
              </label>
              <label className="text-xs font-semibold text-ink-muted">
                Rate (₹)
                <input
                  inputMode="decimal"
                  value={line.rate}
                  onChange={(e) => setLine(line.key, { rate: e.target.value.replace(/[^\d.]/g, "") })}
                  className={`${inputClass} tabular`}
                />
              </label>
              <label className="text-xs font-semibold text-ink-muted">
                Unit
                <select value={line.unit} onChange={(e) => setLine(line.key, { unit: e.target.value as ServiceUnit })} className={`${inputClass} bg-surface`}>
                  {SERVICE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABELS[u]}
                    </option>
                  ))}
                </select>
              </label>
              {allowGst && (
                <label className="text-xs font-semibold text-ink-muted">
                  GST
                  <select
                    value={line.taxRate}
                    onChange={(e) => setLine(line.key, { taxRate: Number(e.target.value) })}
                    className={`${inputClass} bg-surface`}
                  >
                    {rateChoices(line.taxRate).map((r) => (
                      <option key={r} value={r}>
                        {r === 0 ? "No GST" : `${r}%`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {detailed && allowGst && (
              <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink-muted">
                HSN/SAC
                <input
                  inputMode="numeric"
                  value={line.sac ?? ""}
                  onChange={(e) => setLine(line.key, { sac: e.target.value.replace(/\D/g, "").slice(0, 8) || null })}
                  placeholder="998596"
                  className="h-9 w-28 rounded-lg border border-line px-2 text-sm font-semibold tabular text-ink focus:border-sun-300 focus:outline-none"
                />
              </label>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                {lineError(i) && <span className="text-sm text-danger">{lineError(i)}</span>}
                {!lineError(i) && line.catalogueItemId === null && line.name.trim().length >= 2 && Number(line.rate) > 0 && (
                  <button
                    type="button"
                    onClick={() => void saveToPriceList(line)}
                    disabled={saving === line.key}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-strong hover:text-brand-deep disabled:opacity-50"
                  >
                    <BookmarkPlus className="size-3.5" /> {saving === line.key ? "Saving…" : "Save to price list"}
                  </button>
                )}
                {line.catalogueItemId && detailed && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-subtle">
                    <Check className="size-3.5" /> From your price list
                  </span>
                )}
              </span>
              <span className="font-bold tabular">{formatMoney(amounts[i] ?? 0, { paise: (amounts[i] ?? 0) % 1 !== 0 })}</span>
            </div>
          </Card>
        ))}
      </div>
      {errors.items && <p className="mt-2 text-sm text-danger">{errors.items}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setPicking(true)}>
          <Plus className="size-4" strokeWidth={2.5} /> From price list
        </Button>
        <Button type="button" variant="ghost" onClick={addCustom}>
          <Plus className="size-4" strokeWidth={2.5} /> A one-off line
        </Button>
      </div>
      <CataloguePicker open={picking} onClose={() => setPicking(false)} onPick={addFromCatalogue} onCustom={addCustom} />
    </section>
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
  const [q, setQ] = useState("");
  const shown = (items.data ?? []).filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="Add from your price list">
      {(items.data?.length ?? 0) > 6 && (
        <label className="relative mb-3 block">
          <span className="sr-only">Find a service</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a service"
            className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-[15px] focus:border-sun-300 focus:shadow-glow focus:outline-none"
          />
        </label>
      )}
      {items.isPending && (
        <div className="flex justify-center py-6 text-brand">
          <Spinner />
        </div>
      )}
      <ul className="-mx-2 max-h-[50dvh] space-y-1 overflow-y-auto">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="flex w-full items-baseline justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-cream"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{item.name}</span>
                {item.description && <span className="block truncate text-sm text-ink-muted">{item.description}</span>}
              </span>
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
