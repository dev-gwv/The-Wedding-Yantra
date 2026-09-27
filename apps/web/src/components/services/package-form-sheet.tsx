"use client";

import { formatMoney, GST_RATE_CHOICES } from "@wedding-yantra/core";
import { useCatalogue, useCreatePackage, useDeletePackage, useUpdatePackage } from "@wedding-yantra/api-client/react";
import { packageInput, SERVICE_UNITS, UNIT_LABELS, type ServicePackage, type ServiceUnit } from "@wedding-yantra/types";
import { ListPlus, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export function PackageFormSheet({ open, onClose, pkg }: { open: boolean; onClose: () => void; pkg?: ServicePackage }) {
  return (
    <Sheet open={open} onClose={onClose} title={pkg ? "Edit package" : "Make a package"} description="Services sold together at one price.">
      {open && <PackageForm pkg={pkg} onDone={onClose} />}
    </Sheet>
  );
}

/** One thing the package includes, while it's being edited. */
interface Row {
  key: string;
  catalogueItemId: string | null;
  text: string;
  quantity: string;
}

let seq = 0;
const nextKey = () => `pi-${++seq}`;

const inputClass = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] focus:border-sun-300 focus:shadow-glow focus:outline-none";

function PackageForm({ pkg, onDone }: { pkg?: ServicePackage; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const services = useCatalogue(workspace.id);
  const create = useCreatePackage(workspace.id);
  const update = useUpdatePackage(workspace.id);
  const remove = useDeletePackage(workspace.id);
  const toast = useToast();
  const [v, setV] = useState({
    name: pkg?.name ?? "",
    description: pkg?.description ?? "",
    price: pkg ? String(pkg.price) : "",
    sac: pkg?.sac ?? "",
  });
  const [unit, setUnit] = useState<ServiceUnit>(pkg?.unit ?? "event");
  const [taxRate, setTaxRate] = useState(pkg?.taxRate ?? 0);
  const [rows, setRows] = useState<Row[]>(
    () =>
      pkg?.items.map((i) => ({ key: nextKey(), catalogueItemId: i.catalogueItemId, text: i.catalogueItemId ? "" : i.name, quantity: String(i.quantity ?? 1) })) ?? [
        { key: nextKey(), catalogueItemId: null, text: "", quantity: "1" },
      ],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const list = services.data ?? [];
  // What its services cost one by one, to show what the client saves.
  const worth = rows.reduce((a, r) => {
    const s = r.catalogueItemId ? list.find((x) => x.id === r.catalogueItemId) : undefined;
    return a + (s ? s.price * (Number(r.quantity) || 0) : 0);
  }, 0);
  const price = Number(v.price) || 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...v,
      unit,
      taxRate,
      items: rows
        .filter((r) => r.catalogueItemId || r.text.trim())
        .map((r) => (r.catalogueItemId ? { catalogueItemId: r.catalogueItemId, quantity: r.quantity || "1" } : { text: r.text })),
    };
    const check = validate(packageInput, payload);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (pkg) await update.mutateAsync({ id: pkg.id, ...payload });
      else await create.mutateAsync(payload);
      toast(pkg ? "Package saved" : "Package made. Add it to a quote from the price list.");
      onDone();
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { _: errorMessage(err) });
    }
  }

  async function act(fn: () => Promise<unknown>, message: string) {
    try {
      await fn();
      toast(message);
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const itemsError = Object.entries(errors).find(([k]) => k.startsWith("items"))?.[1];

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField
        label="Package name"
        value={v.name}
        onChange={(e) => setV((x) => ({ ...x, name: e.target.value }))}
        error={errors.name}
        autoFocus={!pkg}
        placeholder="Bridal package, Wedding Gold, Silver menu"
      />
      <TextAreaField
        label="About it"
        value={v.description}
        onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))}
        error={errors.description}
        rows={2}
        placeholder="One line the client sees on the quote"
      />

      <fieldset className="space-y-3 rounded-2xl border border-line p-4">
        <legend className="px-1 font-bold">What&apos;s included</legend>
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-end gap-2">
            {r.catalogueItemId !== null ? (
              <>
                <label className="min-w-0 flex-1 text-xs font-semibold text-ink-muted">
                  Service
                  <select
                    value={r.catalogueItemId}
                    onChange={(e) => setRow(r.key, { catalogueItemId: e.target.value })}
                    className={`${inputClass} mt-1 font-semibold text-ink`}
                    aria-label={`Included ${i + 1}`}
                  >
                    {list.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({formatMoney(s.price)} {UNIT_LABELS[s.unit]})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-20 shrink-0 text-xs font-semibold text-ink-muted">
                  How many
                  <input
                    inputMode="decimal"
                    value={r.quantity}
                    onChange={(e) => setRow(r.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })}
                    className={`${inputClass} mt-1 font-semibold tabular text-ink`}
                  />
                </label>
              </>
            ) : (
              <label className="min-w-0 flex-1 text-xs font-semibold text-ink-muted">
                {i === 0 && rows.length === 1 ? "Included" : "Line"}
                <input
                  value={r.text}
                  onChange={(e) => setRow(r.key, { text: e.target.value })}
                  placeholder="Trial session, 3 starters, drone coverage…"
                  className={`${inputClass} mt-1 text-ink`}
                  aria-label={`Included ${i + 1}`}
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              aria-label={`Remove included ${i + 1}`}
              className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        {itemsError && <p className="text-sm text-danger">{itemsError}</p>}
        <div className="flex flex-wrap gap-2">
          {list.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRows((rs) => [...rs.filter((x) => x.catalogueItemId || x.text.trim()), { key: nextKey(), catalogueItemId: list[0]!.id, text: "", quantity: "1" }])}
            >
              <Plus className="size-4" /> A service from your list
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { key: nextKey(), catalogueItemId: null, text: "", quantity: "1" }])}>
            <ListPlus className="size-4" /> A line of what&apos;s included
          </Button>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Package price (₹)"
          inputMode="decimal"
          value={v.price}
          onChange={(e) => setV((x) => ({ ...x, price: e.target.value.replace(/[^\d.]/g, "") }))}
          error={errors.price}
        />
        <SelectField label="Charged" value={unit} onChange={(e) => setUnit(e.target.value as ServiceUnit)} hint="Per plate or per person for menus and bars">
          {SERVICE_UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </SelectField>
      </div>
      {worth > 0 && price > 0 && (
        <p className="-mt-2 rounded-xl bg-cream px-3 py-2 text-sm">
          Its services one by one: <span className="font-bold tabular">{formatMoney(worth)}</span>
          {worth > price ? (
            <>
              . The client saves <span className="font-bold tabular text-success">{formatMoney(worth - price)}</span>.
            </>
          ) : (
            "."
          )}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="GST" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} error={errors.taxRate}>
          {([...GST_RATE_CHOICES] as number[]).map((r) => (
            <option key={r} value={r}>
              {r === 0 ? "No GST" : `${r}%`}
            </option>
          ))}
        </SelectField>
        <TextField
          label="SAC code"
          inputMode="numeric"
          value={v.sac}
          onChange={(e) => setV((x) => ({ ...x, sac: e.target.value.replace(/\D/g, "") }))}
          error={errors.sac}
          placeholder="Optional"
        />
      </div>

      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        {pkg ? "Save" : "Make package"}
      </Button>
      {pkg && !confirming && (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void act(() => update.mutateAsync({ id: pkg.id, active: !pkg.active }), pkg.active ? "Hidden from new quotes" : "Shown in quotes again")}>
            {pkg.active ? "Hide from new quotes" : "Show in quotes again"}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      )}
      {pkg && confirming && (
        <div className="space-y-2 rounded-2xl bg-danger-soft p-4">
          <p className="text-sm">Delete {pkg.name}? Quotes and invoices that have it keep it as it was.</p>
          <div className="flex gap-2">
            <Button variant="destructive" loading={remove.isPending} onClick={() => void act(() => remove.mutateAsync(pkg.id), "Package deleted")}>
              Delete package
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
