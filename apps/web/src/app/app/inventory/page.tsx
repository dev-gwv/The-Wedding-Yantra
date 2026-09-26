"use client";

import { can, eventScope } from "@wedding-yantra/core";
import { useInventory } from "@wedding-yantra/api-client/react";
import type { InventoryItem } from "@wedding-yantra/types";
import { Boxes, ChevronRight, Lock, Plus } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ItemSheet } from "@/components/inventory/inventory";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";

/** What the business owns, and what's out at events right now. */
export default function InventoryPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = eventScope(workspace.role) === "all";
  const manage = can(workspace.role, "events.manage");
  const items = useInventory(workspace.id, {}, allowed);
  const [sheet, setSheet] = useState<{ item?: InventoryItem } | null>(null);

  if (!allowed) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Stock" />
        <Card>
          <EmptyState icon={Lock} title="Your role doesn't include stock" />
        </Card>
      </>
    );
  }

  const list = items.data ?? [];
  const groups = [...new Set(list.map((i) => i.category ?? "Other"))];

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title="Stock"
        subtitle="What you own: furniture, lights, sound, glassware. Set it aside for events from each event's page."
        action={
          manage && (
            <Button onClick={() => setSheet({})}>
              <Plus className="size-4" /> Add item
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
      {items.isSuccess && list.length === 0 && (
        <Card>
          <EmptyState icon={Boxes} title="No stock yet">
            Add what you own and how many. Events then show what&apos;s set aside, what&apos;s out and what&apos;s back, and warn you when two events need
            more than you have.
          </EmptyState>
        </Card>
      )}
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-2 font-display text-lg font-extrabold">{g}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {list
                .filter((i) => (i.category ?? "Other") === g)
                .map((i) => (
                  <button key={i.id} type="button" onClick={() => setSheet({ item: i })} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-cream">
                    <span className="min-w-0 flex-1 truncate font-bold">{i.name}</span>
                    {i.outNow > 0 && <span className="shrink-0 text-sm font-semibold text-brand-strong tabular">{i.outNow} out</span>}
                    <span className="shrink-0 font-display text-lg font-extrabold tabular">{i.quantity}</span>
                    <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                  </button>
                ))}
            </Card>
          </section>
        ))}
      </div>
      <ItemSheet open={sheet !== null} onClose={() => setSheet(null)} item={sheet?.item} categories={groups.filter((g) => g !== "Other")} />
    </>
  );
}
