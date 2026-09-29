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

/** To collect: who still owes you, as of today. */
export default function ToCollectPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "finance.view");
  const overview = useMoneyOverview(workspace.id, allowed);
  const [recording, setRecording] = useState(false);
  if (!allowed) return <MoneyLocked section="to-collect" />;
  return (
    <>
      <MoneyPageHeader
        section="to-collect"
        subtitle="Money clients owe you as of today: invoices not paid in full, and booked events you haven't invoiced yet"
        action={
          can(workspace.role, "payments.record") ? (
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
