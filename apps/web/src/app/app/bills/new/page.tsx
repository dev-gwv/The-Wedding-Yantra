"use client";

import { can } from "@wedding-yantra/core";
import { useBillDraft } from "@wedding-yantra/api-client/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { BillEditor } from "@/components/money/bill-editor";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

function NewBill() {
  const params = useSearchParams();
  const query = {
    eventId: params.get("eventId") ?? undefined,
    clientId: params.get("clientId") ?? undefined,
    quoteId: params.get("quoteId") ?? undefined,
  };
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "bills.manage");
  const hasTarget = !!(query.eventId || query.clientId || query.quoteId);
  const draft = useBillDraft(workspace.id, query, allowed && hasTarget);
  const router = useRouter();
  const toast = useToast();

  if (!allowed) return <Notice>Only the owner or a manager can make bills.</Notice>;
  if (!hasTarget) return <Notice tone="danger">Open an event or a client first, then make the bill from there.</Notice>;
  if (draft.isPending) return <Splash />;
  if (draft.isError) return <Notice tone="danger">{errorMessage(draft.error)}</Notice>;

  const d = draft.data;
  const back = d.eventId ? `/app/events/${d.eventId}` : d.clientId ? `/app/clients/${d.clientId}` : "/app/money";
  return (
    <>
      <BackLink href={back} label={d.billTo.name || "Back"} />
      <PageHeader title="New bill" subtitle={d.quoteId ? "From the accepted quote. Check it and make the bill." : undefined} />
      <BillEditor
        draft={d}
        onSaved={(bill) => {
          toast(`Bill ${bill.number} made`);
          router.replace(`/app/bills/${bill.id}`);
        }}
      />
    </>
  );
}

export default function NewBillPage() {
  return (
    <Suspense fallback={<Splash />}>
      <NewBill />
    </Suspense>
  );
}
