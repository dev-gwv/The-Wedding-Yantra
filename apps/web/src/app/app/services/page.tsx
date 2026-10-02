"use client";

import { can, formatMoney } from "@wedding-yantra/core";
import { useAddStarterPackages, useCatalogue, usePackages } from "@wedding-yantra/api-client/react";
import { UNIT_LABELS, type CatalogueItem, type ServicePackage } from "@wedding-yantra/types";
import { Package, Plus, Sparkles, Tag } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useOptionList } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { PackageFormSheet } from "@/components/services/package-form-sheet";
import { ConfirmPrices, ServiceForm } from "@/components/services/service-form";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Splash, Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

type Tab = "services" | "packages";

export default function ServicesPage() {
  return (
    <Suspense fallback={<Splash />}>
      <ServicesAndPackages />
    </Suspense>
  );
}

/**
 * What the business sells, for any trade: services grouped by its own categories, and
 * packages that sell several together at one price (per event, or per plate or person).
 */
function ServicesAndPackages() {
  const { workspace } = useCurrentWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const tab: Tab = params.get("tab") === "packages" ? "packages" : "services";
  const editable = can(workspace, "catalogue.manage");
  const items = useCatalogue(workspace.id, true);
  const packages = usePackages(workspace.id, true);
  const [editing, setEditing] = useState<{ service?: CatalogueItem; category?: string | null } | null>(null);
  const [pkg, setPkg] = useState<{ p?: ServicePackage } | null>(null);
  const setTab = (t: Tab) => router.replace(t === "packages" ? "/app/services?tab=packages" : "/app/services");

  return (
    <>
      <BackLink href="/app/masters" label="Master data" />
      <PageHeader
        title="Services and packages"
        subtitle="What you sell and what it costs. Quotes and invoices are built from here in a few taps."
        action={
          editable &&
          (tab === "services" ? (
            <Button onClick={() => setEditing({})}>
              <Plus className="size-4" strokeWidth={2.5} /> Add service
            </Button>
          ) : (
            <Button onClick={() => setPkg({})}>
              <Plus className="size-4" strokeWidth={2.5} /> Make package
            </Button>
          ))
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["services", `Services${items.data ? ` (${items.data.filter((i) => i.active).length})` : ""}`],
            ["packages", `Packages${packages.data ? ` (${packages.data.filter((p) => p.active).length})` : ""}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={cn("h-9 rounded-full px-4 text-sm font-bold", tab === key ? "bg-ink text-surface" : "border border-line bg-surface text-ink hover:bg-cream")}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "services" ? (
        <ServicesList items={items} editable={editable} onEdit={setEditing} />
      ) : (
        <PackagesList packages={packages} editable={editable} onEdit={(p) => setPkg({ p })} onNew={() => setPkg({})} />
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing?.service ? "Edit service" : "Add a service"}>
        {editing !== null && <ServiceForm item={editing.service} defaultCategory={editing.category} onDone={() => setEditing(null)} />}
      </Sheet>
      <PackageFormSheet open={pkg !== null} pkg={pkg?.p} onClose={() => setPkg(null)} />
    </>
  );
}

function ServicesList({
  items,
  editable,
  onEdit,
}: {
  items: ReturnType<typeof useCatalogue>;
  editable: boolean;
  onEdit: (e: { service?: CatalogueItem; category?: string | null }) => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const categories = useOptionList("service_category");
  if (items.isPending)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner />
      </div>
    );
  if (items.isError) return <Notice tone="danger">{errorMessage(items.error)}</Notice>;
  const all = items.data;
  if (all.length === 0)
    return (
      <Card>
        <EmptyState icon={Package} title="No services yet" action={editable && <Button onClick={() => onEdit({})}>Add your first service</Button>}>
          Add what you sell with its usual price: per event, per day, per look, per plate or per person.
        </EmptyState>
      </Card>
    );

  // Grouped by the business's own categories, in its order; the rest last.
  const groups = [
    ...categories.options.map((c) => ({ key: c.key as string | null, label: c.label, items: all.filter((i) => i.category === c.key) })),
    { key: null, label: "Not in a category", items: all.filter((i) => !i.category || !categories.options.some((c) => c.key === i.category)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {can(workspace, "workspace.update") && <ConfirmPrices />}
      {groups.map((g) => (
        <section key={g.key ?? "none"}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
              <Tag className="size-4 text-brand-strong" /> {g.label}
            </h2>
            {editable && g.key && (
              <button type="button" onClick={() => onEdit({ category: g.key })} className="text-sm font-bold text-brand-strong hover:text-brand-deep">
                + Add
              </button>
            )}
          </div>
          <Card className="divide-y divide-line overflow-hidden">
            {g.items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!editable}
                onClick={() => onEdit({ service: item })}
                className={cn("flex w-full items-baseline justify-between gap-4 px-5 py-4 text-left enabled:hover:bg-cream", !item.active && "opacity-50")}
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold">{item.name}</span>
                  {item.description && <span className="block truncate text-sm text-ink-muted">{item.description}</span>}
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
        </section>
      ))}
    </div>
  );
}

function PackagesList({
  packages,
  editable,
  onEdit,
  onNew,
}: {
  packages: ReturnType<typeof usePackages>;
  editable: boolean;
  onEdit: (p: ServicePackage) => void;
  onNew: () => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const starter = useAddStarterPackages(workspace.id);
  const toast = useToast();
  if (packages.isPending)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner />
      </div>
    );
  if (packages.isError) return <Notice tone="danger">{errorMessage(packages.error)}</Notice>;

  const addExamples = () =>
    starter.mutate(undefined, {
      onSuccess: (list) => toast(list.length ? "Examples added. Change them to your own." : "There are no examples for your kind of business yet"),
      onError: (err) => toast(errorMessage(err), "error"),
    });

  if (packages.data.length === 0)
    return (
      <Card>
        <EmptyState
          icon={Package}
          title="No packages yet"
          action={
            editable && (
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={onNew}>Make a package</Button>
                <Button variant="secondary" onClick={addExamples} loading={starter.isPending}>
                  <Sparkles className="size-4" /> Start from examples
                </Button>
              </div>
            )
          }
        >
          Sell several services together at one price: a bridal package, a two-day wedding shoot, a menu per plate, a sangeet night. Add one to a quote in one
          tap.
        </EmptyState>
      </Card>
    );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {packages.data.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={!editable}
          onClick={() => onEdit(p)}
          className={cn("text-left", !p.active && "opacity-50")}
        >
          <Card className="flex h-full flex-col p-5 transition enabled:hover:border-sun-300">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-extrabold leading-tight">{p.name}</p>
                {p.description && <p className="mt-0.5 text-sm text-ink-muted">{p.description}</p>}
              </div>
              <Package className="size-5 shrink-0 text-brand-strong" />
            </div>
            <ul className="mt-3 flex-1 space-y-1 text-[15px]">
              {p.items.map((i) => (
                <li key={i.id} className="flex gap-2">
                  <span className="text-brand-strong">•</span>
                  <span>
                    {i.name}
                    {i.quantity && i.quantity !== 1 ? <span className="text-ink-muted"> × {i.quantity}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
              <span>
                <span className="font-display text-xl font-extrabold tabular">{formatMoney(p.price)}</span>{" "}
                <span className="text-sm text-ink-muted">{UNIT_LABELS[p.unit]}</span>
              </span>
              {p.worth > p.price ? (
                <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success">Saves {formatMoney(p.worth - p.price)}</span>
              ) : (
                !p.active && <span className="text-xs font-bold text-ink-subtle">Hidden from quotes</span>
              )}
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}
