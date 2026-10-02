"use client";

import { can } from "@wedding-yantra/core";
import { useMoneyOverview } from "@wedding-yantra/api-client/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { DueView } from "@/components/money/due-view";
import { MoneyLocked, MoneyPageHeader, ToPayVendorsLink } from "@/components/money/money-page";
import { RecordPaymentSheet } from "@/components/money/payments-view";
import { Button } from "@/components/ui/button";

/** Outstanding: payments clients still owe, as of today. */
export default function OutstandingPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace, "finance.view");
  const overview = useMoneyOverview(workspace.id, allowed);
  const [recording, setRecording] = useState(false);
  if (!allowed) return <MoneyLocked section="outstanding" />;
  return (
    <>
      <MoneyPageHeader
        section="outstanding"
        subtitle="Payments due from clients as of today: unpaid invoice balances, and booked events not yet invoiced"
        action={
          can(workspace, "payments.record") ? (
            <Button onClick={() => setRecording(true)}>
              <Plus className="size-4" strokeWidth={2.5} /> Record payment
            </Button>
          ) : null
        }
      />
      <DueView />
      <ToPayVendorsLink />
      <RecordPaymentSheet open={recording} onClose={() => setRecording(false)} dues={overview.data?.dues ?? []} />
    </>
  );
}
