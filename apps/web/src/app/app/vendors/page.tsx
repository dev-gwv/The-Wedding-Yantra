"use client";

import { can, formatMoney } from "@wedding-yantra/core";
import { usePayouts, useVendors } from "@wedding-yantra/api-client/react";
import type { Payout } from "@wedding-yantra/types";
import { ChevronRight, HandCoins, Lock, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { PayoutRow } from "@/components/vendors/payouts";
import { PaySheet, PayoutSheet, VendorSheet } from "@/components/vendors/sheets";
import { errorMessage } from "@/lib/errors";

/** Who you hire for events, and what you still owe them. */
export default function VendorsPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "finance.view");
  const manage = can(workspace.role, "expenses.approve");
  const vendors = useVendors(workspace.id, allowed);
  const owed = usePayouts(workspace.id, { status: "owed" }, allowed);
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [sheet, setSheet] = useState<{ p?: Payout } | null>(null);
  const [paying, setPaying] = useState<Payout | null>(null);

  if (!allowed) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Vendors" />
        <Card>
          <EmptyState icon={Lock} title="Vendors and payouts are for the owner, managers and the accountant" />
        </Card>
      </>
    );
  }

  const toPay = (owed.data ?? []).reduce((a, p) => a + p.amount, 0);

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title="Vendors"
        subtitle="Florists, helpers, generators, a second shooter: who you hire, and what you owe them."
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

      {owed.data && owed.data.length > 0 && (
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
          <h2 className="mb-3 font-display text-xl font-extrabold">Your vendors</h2>
          {vendors.data.length === 0 ? (
            <Card>
              <EmptyState icon={Users} title="No vendors yet">
                Add the people you hire for events. Then note what each event owes them, and pay by UPI in one tap.
              </EmptyState>
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {vendors.data.map((v) => (
                <Link key={v.id} href={`/app/vendors/${v.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{v.name}</p>
                    <p className="truncate text-sm text-ink-muted">{[v.service, v.paid > 0 ? `${formatMoney(v.paid)} paid` : v.owed > 0 ? "Nothing paid yet" : null].filter(Boolean).join(" · ") || "No payouts yet"}</p>
                  </div>
                  {v.owed > 0 && <span className="shrink-0 text-sm font-bold tabular text-brand-strong">{formatMoney(v.owed)} to pay</span>}
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              ))}
            </Card>
          )}
          {manage && vendors.data.length > 0 && (!owed.data || owed.data.length === 0) && (
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
