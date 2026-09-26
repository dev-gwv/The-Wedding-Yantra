"use client";

import { can, formatMoney } from "@wedding-yantra/core";
import { useCatalogue, useCreateCatalogueItem, useHome, useUpdateCatalogueItem, useUpdateWorkspace } from "@wedding-yantra/api-client/react";
import { catalogueItemInput, GST_RATES, SERVICE_UNITS, UNIT_LABELS, type CatalogueItem, type ServiceUnit } from "@wedding-yantra/types";
import { Check, Package, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Card, EmptyState, NextStepCard, Notice, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export default function ServicesPage() {
  const { workspace } = useCurrentWorkspace();
  const items = useCatalogue(workspace.id, true);
  const editable = can(workspace.role, "catalogue.manage");
  const [editing, setEditing] = useState<CatalogueItem | "new" | null>(null);

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title="Services and prices"
        subtitle="Your price list. Quotes are built from it in a few taps."
        action={
          editable && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" strokeWidth={2.5} /> Add service
            </Button>
          )
        }
      />
      {items.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {items.isError && <Notice tone="danger">{errorMessage(items.error)}</Notice>}
      {items.data && items.data.length > 0 && can(workspace.role, "workspace.update") && <ConfirmPrices />}
      {items.data?.length === 0 && (
        <Card>
          <EmptyState icon={Package} title="No services yet">
            Add what you sell with its usual price: per event, per day, per plate or per person.
          </EmptyState>
        </Card>
      )}
      {items.data && items.data.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {items.data.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!editable}
              onClick={() => setEditing(item)}
              className={cn("flex w-full items-baseline justify-between gap-4 px-5 py-4 text-left enabled:hover:bg-cream", !item.active && "opacity-50")}
            >
              <span className="min-w-0">
                <span className="block truncate font-bold">{item.name}</span>
                <span className="text-sm text-ink-muted">
                  {UNIT_LABELS[item.unit]}
                  {item.taxRate > 0 && ` · GST ${item.taxRate}%`}
                  {item.sac && ` · SAC ${item.sac}`}
                  {!item.active && " · Hidden from quotes"}
                </span>
              </span>
              <span className="shrink-0 font-bold tabular">{formatMoney(item.price)}</span>
            </button>
          ))}
        </Card>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a service" : "Edit service"}>
        {editing !== null && <ServiceForm item={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function ServiceForm({ item, onDone }: { item?: CatalogueItem; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateCatalogueItem(workspace.id);
  const update = useUpdateCatalogueItem(workspace.id);
  const toast = useToast();
  const [values, setValues] = useState({
    name: item?.name ?? "",
    unit: (item?.unit ?? "event") as ServiceUnit,
    price: item ? String(item.price) : "",
    taxRate: item?.taxRate ?? 0,
    sac: item?.sac ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(catalogueItemInput, values);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (item) await update.mutateAsync({ id: item.id, ...values });
      else await create.mutateAsync(values);
      toast("Price list saved");
      onDone();
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  async function toggle() {
    if (!item) return;
    try {
      await update.mutateAsync({ id: item.id, active: !item.active });
      toast(item.active ? "Hidden from new quotes" : "Shown in quotes again");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Service" value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} error={errors.name} placeholder="Bridal HD makeup" autoFocus={!item} />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Price (₹)"
          inputMode="decimal"
          value={values.price}
          onChange={(e) => setValues((v) => ({ ...v, price: e.target.value.replace(/[^\d.]/g, "") }))}
          error={errors.price}
        />
        <SelectField label="Charged" value={values.unit} onChange={(e) => setValues((v) => ({ ...v, unit: e.target.value as ServiceUnit }))}>
          {SERVICE_UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABELS[u]}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="GST" value={values.taxRate} onChange={(e) => setValues((v) => ({ ...v, taxRate: Number(e.target.value) }))} error={errors.taxRate}>
          {GST_RATES.map((r) => (
            <option key={r} value={r}>
              {r === 0 ? "No GST" : `${r}%`}
            </option>
          ))}
        </SelectField>
        <TextField
          label="SAC code"
          inputMode="numeric"
          value={values.sac}
          onChange={(e) => setValues((v) => ({ ...v, sac: e.target.value.replace(/\D/g, "") }))}
          error={errors.sac}
          placeholder="Optional"
        />
      </div>
      <p className="-mt-2 text-sm text-ink-muted">Leave GST as No GST if you don&apos;t charge it. The SAC code is printed on GST invoices; your CA can tell you yours.</p>
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        Save
      </Button>
      {item && (
        <Button variant="ghost" size="lg" onClick={toggle}>
          {item.active ? "Hide from new quotes" : "Show in quotes again"}
        </Button>
      )}
    </form>
  );
}

/** The setup step "Check your prices": done by changing one, or by saying they're right. */
function ConfirmPrices() {
  const { workspace } = useCurrentWorkspace();
  const home = useHome(workspace.id);
  const update = useUpdateWorkspace(workspace.id);
  const toast = useToast();
  const router = useRouter();
  const step = home.data?.setup.find((s) => s.key === "price_list");
  if (!step || step.done) return null;
  return (
    <NextStepCard className="mb-5 flex flex-wrap items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <p className="font-bold">Are these your prices?</p>
        <p className="text-sm text-ink-muted">Tap a service to change its price. If they&apos;re right as they are, say so.</p>
      </div>
      <Button
        loading={update.isPending}
        onClick={() =>
          update.mutate(
            { pricesConfirmed: true },
            {
              onSuccess: () => {
                toast("Prices confirmed. That step is done");
                if (new URLSearchParams(window.location.search).get("from") === "setup") router.push("/app");
              },
              onError: (err) => toast(errorMessage(err), "error"),
            },
          )
        }
      >
        <Check className="size-4" strokeWidth={3} /> These prices are right
      </Button>
    </NextStepCard>
  );
}

