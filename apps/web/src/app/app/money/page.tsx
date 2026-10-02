"use client";

import { can } from "@wedding-yantra/core";
import { useMoneyOverview } from "@wedding-yantra/api-client/react";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { MoneyLocked, MoneyPageHeader, useMoneyRange } from "@/components/money/money-page";
import { PaymentsView, RecordPaymentSheet } from "@/components/money/payments-view";
import { Button } from "@/components/ui/button";
import { Splash } from "@/components/ui/spinner";

/** Old links (?view=due and so on) now have pages of their own. */
const MOVED: Record<string, string> = {
  due: "/app/money/outstanding",
  invoices: "/app/money/invoices",
  bills: "/app/money/invoices",
  quotes: "/app/money/quotes",
  expenses: "/app/money/expenses",
};

/** Transactions: every rupee that came in on the chosen dates, with or without an invoice. */
function TransactionsScreen() {
  const { workspace } = useCurrentWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const allowed = can(workspace, "finance.view");
  const [range, setRange] = useMoneyRange();
  const [recording, setRecording] = useState(false);
  const overview = useMoneyOverview(workspace.id, allowed);
  const moved = MOVED[params.get("view") ?? ""];

  useEffect(() => {
    if (!moved) return;
    const next = new URLSearchParams(params);
    next.delete("view");
    const rest = next.toString();
    router.replace(rest ? `${moved}?${rest}` : moved);
  }, [moved, params, router]);

  if (moved) return <Splash />;
  if (!allowed) return <MoneyLocked section="transactions" />;
  return (
    <>
      <MoneyPageHeader
        section="transactions"
        dates={{ range, onChange: setRange }}
        action={
          can(workspace, "payments.record") ? (
            <Button onClick={() => setRecording(true)}>
              <Plus className="size-4" strokeWidth={2.5} /> Record payment
            </Button>
          ) : null
        }
      />
      <PaymentsView range={range} />
      <RecordPaymentSheet open={recording} onClose={() => setRecording(false)} dues={overview.data?.dues ?? []} />
    </>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<Splash />}>
      <TransactionsScreen />
    </Suspense>
  );
}
