"use client";

import { can } from "@wedding-yantra/core";
import { Plus } from "lucide-react";
import { Suspense } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { InvoicesView } from "@/components/money/invoices-view";
import { MoneyLocked, MoneyPageHeader, useMoneyRange } from "@/components/money/money-page";
import { ButtonLink } from "@/components/ui/button";
import { Splash } from "@/components/ui/spinner";

function InvoicesScreen() {
  const { workspace } = useCurrentWorkspace();
  const [range, setRange] = useMoneyRange();
  if (!can(workspace.role, "finance.view")) return <MoneyLocked section="invoices" />;
  return (
    <>
      <MoneyPageHeader
        section="invoices"
        dates={{ range, onChange: setRange }}
        action={
          can(workspace.role, "bills.manage") ? (
            <ButtonLink href="/app/bills/new">
              <Plus className="size-4" strokeWidth={2.5} /> New invoice
            </ButtonLink>
          ) : null
        }
      />
      <InvoicesView range={range} />
    </>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<Splash />}>
      <InvoicesScreen />
    </Suspense>
  );
}
