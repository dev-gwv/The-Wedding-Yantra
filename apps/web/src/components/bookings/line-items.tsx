"use client";

import { formatMoney } from "@wedding-yantra/core";
import { useCatalogue } from "@wedding-yantra/api-client/react";
import { GST_RATES, SERVICE_UNITS, UNIT_LABELS, type CatalogueItem, type ServiceUnit } from "@wedding-yantra/types";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";

/** One line while it's being edited: numbers stay text so people can type freely. */
export interface EditableLine {
  key: string;
  catalogueItemId: string | null;
  name: string;
  sac: string | null;
  unit: ServiceUnit;
  quantity: string;
  rate: string;
  taxRate: number;
}

let keySeq = 0;
const nextKey = () => `line-${++keySeq}`;

export function toEditableLines(
  items: { catalogueItemId: string | null; name: string; sac?: string | null; unit: ServiceUnit; quantity: number; rate: number; taxRate: number }[],
): EditableLine[] {
  return items.map((i) => ({
    key: nextKey(),
    catalogueItemId: i.catalogueItemId,
    name: i.name,
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
    sac: l.sac,
    unit: l.unit,
    quantity: l.quantity,
    rate: l.rate || "0",
    taxRate: l.taxRate,
  }));

const inputClass =
  "mt-1 h-11 w-full rounded-xl border border-line px-3 text-[15px] font-semibold text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none";

/**
 * The services on a quote or bill: pick from the price list or add a one-off line, then
 * adjust quantity, rate, unit and GST.
 */
export function LineItemsEditor({
  lines,
  onChange,
  amounts,
  errors,
  allowGst = true,
}: {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  /** Worked-out amount of each line, in the same order */
  amounts: number[];
  /** Field errors from the shared schema, keyed like `items.0.name` */
  errors: Record<string, string>;
  /** Off for businesses without a GST number */
  allowGst?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const setLine = (key: string, patch: Partial<EditableLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const lineError = (i: number) => Object.entries(errors).find(([k]) => k.startsWith(`items.${i}.`))?.[1];

  function addFromCatalogue(item: CatalogueItem) {
    onChange([
      ...lines,
      {
        key: nextKey(),
        catalogueItemId: item.id,
        name: item.name,
        sac: item.sac,
        unit: item.unit,
        quantity: "1",
        rate: String(item.price),
        taxRate: allowGst ? item.taxRate : 0,
      },
    ]);
    setPicking(false);
  }

  function addCustom() {
    onChange([...lines, { key: nextKey(), catalogueItemId: null, name: "", sac: null, unit: "event", quantity: "1", rate: "", taxRate: 0 }]);
    setPicking(false);
  }

  return (
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
                <select
                  value={line.unit}
                  onChange={(e) => setLine(line.key, { unit: e.target.value as ServiceUnit })}
                  className={`${inputClass} bg-surface`}
                >
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
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r === 0 ? "No GST" : `${r}%`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-sm text-danger">{lineError(i)}</span>
              <span className="font-bold tabular">{formatMoney(amounts[i] ?? 0, { paise: (amounts[i] ?? 0) % 1 !== 0 })}</span>
            </div>
          </Card>
        ))}
      </div>
      {errors.items && <p className="mt-2 text-sm text-danger">{errors.items}</p>}
      <Button type="button" variant="secondary" className="mt-3" onClick={() => setPicking(true)}>
        <Plus className="size-4" strokeWidth={2.5} /> Add a service
      </Button>
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
              className="flex w-full items-baseline justify-between gap-3 rounded-2xl px-3 py-3 text-left hover:bg-cream"
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
