"use client";

import { can, formatMoney } from "@wedding-yantra/core";
import { usePayouts, useVendors } from "@wedding-yantra/api-client/react";
import type { Payout } from "@wedding-yantra/types";
import { ChevronRight, HandCoins, Lock, Plus, Search, Star, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { useOptionList } from "@/components/app/option-picker";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { PayoutRow } from "@/components/vendors/payouts";
import { PaySheet, PayoutSheet, VendorSheet } from "@/components/vendors/sheets";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/** Who you hire for events, and what you still owe them. */
export default function VendorsPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace, "finance.view");
  const manage = can(workspace, "expenses.approve");
  const [archived, setArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const q = useDeferredValue(search.trim().toLowerCase());
  const vendors = useVendors(workspace.id, allowed, archived);
  const categories = useOptionList("vendor_category");
  const owed = usePayouts(workspace.id, { status: "owed" }, allowed);
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [sheet, setSheet] = useState<{ p?: Payout } | null>(null);
  const [paying, setPaying] = useState<Payout | null>(null);

  if (!allowed) {
    return (
      <>
        <BackLink href="/app/masters" label="Master data" />
        <PageHeader title="Vendors" />
        <Card>
          <EmptyState icon={Lock} title="Vendors and payouts are for the owner, managers and the accountant" />
        </Card>
      </>
    );
  }

  const toPay = (owed.data ?? []).reduce((a, p) => a + p.amount, 0);
  const digits = q.replace(/\D/g, "");
  const shown = (vendors.data ?? []).filter(
    (v) =>
      (!category || v.category === category) &&
      (!q ||
        v.name.toLowerCase().includes(q) ||
        (v.contactPerson ?? "").toLowerCase().includes(q) ||
        (v.city ?? "").toLowerCase().includes(q) ||
        (v.service ?? "").toLowerCase().includes(q) ||
        (digits.length >= 3 && (v.phone ?? "").includes(digits))),
  );
  // Only the categories in use, as filter chips.
  const used = categories.active.filter((o) => (vendors.data ?? []).some((v) => v.category === o.key));

  return (
    <>
      <BackLink href="/app/masters" label="Master data" />
      <PageHeader
        title="Vendors"
        subtitle="Florists, tent and décor, DJ, caterers: who you hire, how to pay them, and what you owe them."
        action={
          manage && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add vendor
            </Button>
          )
        }
      />

      {(vendors.isPending || owed.isPending) && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {vendors.isError && <Notice tone="danger">{errorMessage(vendors.error)}</Notice>}

      {!archived && owed.data && owed.data.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-extrabold">To pay</h2>
            <span className="font-display text-lg font-extrabold tabular">{formatMoney(toPay)}</span>
          </div>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {owed.data.map((p) => (
                <PayoutRow key={p.id} p={p} show="all" onOpen={(x) => manage && setSheet({ p: x })} onPay={manage ? setPaying : undefined} />
              ))}
            </ul>
          </Card>
          {manage && (
            <Button variant="secondary" className="mt-3" onClick={() => setSheet({})}>
              <HandCoins className="size-4" /> Add what you owe
            </Button>
          )}
        </section>
      )}

      {vendors.data && (
        <section>
          <h2 className="mb-3 font-display text-xl font-extrabold">{archived ? "Archived vendors" : "Your vendors"}</h2>
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <span className="sr-only">Search vendors</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search a name, contact, city or number"
              className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-[15px] placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none"
            />
          </label>
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                [false, "Vendors"],
                [true, "Archived"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={archived === value}
                onClick={() => {
                  setArchived(value);
                  setCategory(null);
                }}
                className={cn("h-9 rounded-full px-4 text-sm font-bold", archived === value ? "bg-ink text-surface" : "border border-line bg-surface text-ink hover:bg-cream")}
              >
                {label}
              </button>
            ))}
            {used.length > 1 && <span className="mx-1 w-px self-stretch bg-line" aria-hidden />}
            {used.length > 1 &&
              used.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={category === o.key}
                  onClick={() => setCategory(category === o.key ? null : o.key)}
                  className={cn("h-9 rounded-full px-4 text-sm font-bold", category === o.key ? "bg-gradient-primary text-on-brand" : "border border-line bg-surface text-ink hover:bg-cream")}
                >
                  {o.label}
                </button>
              ))}
          </div>
          {vendors.data.length === 0 ? (
            <Card>
              <EmptyState icon={Users} title={archived ? "No archived vendors" : "No vendors yet"}>
                {archived ? "Vendors you archive show here, with their payouts kept." : "Add the people you hire for events. Then note what each event owes them, and pay by UPI in one tap."}
              </EmptyState>
            </Card>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-ink-muted">No vendors match.</p>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {shown.map((v) => (
                <Link key={v.id} href={`/app/vendors/${v.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-bold">
                      <span className="truncate">{v.name}</span>
                      {v.preferred && <Star className="size-4 shrink-0 fill-brand text-brand" aria-label="Preferred" />}
                    </p>
                    <p className="truncate text-sm text-ink-muted">
                      {[v.service, v.city, v.paid > 0 ? `${formatMoney(v.paid)} paid` : null].filter(Boolean).join(" · ") || "No details yet"}
                    </p>
                  </div>
                  {v.owed > 0 && <span className="shrink-0 text-sm font-bold tabular text-brand-strong">{formatMoney(v.owed)} to pay</span>}
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              ))}
            </Card>
          )}
          {manage && !archived && vendors.data.length > 0 && (!owed.data || owed.data.length === 0) && (
            <Button variant="secondary" className="mt-3" onClick={() => setSheet({})}>
              <HandCoins className="size-4" /> Add what you owe
            </Button>
          )}
        </section>
      )}

      <VendorSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(v) => {
          setAdding(false);
          router.push(`/app/vendors/${v.id}`);
        }}
      />
      <PayoutSheet open={sheet !== null} onClose={() => setSheet(null)} payout={sheet?.p} />
      <PaySheet payout={paying} onClose={() => setPaying(null)} />
    </>
  );
}
