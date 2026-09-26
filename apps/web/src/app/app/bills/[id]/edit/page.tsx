"use client";

import { useBill } from "@wedding-yantra/api-client/react";
import { useParams, useRouter } from "next/navigation";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { BillEditor } from "@/components/money/bill-editor";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

export default function EditBillPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const bill = useBill(workspace.id, id);
  const router = useRouter();
  const toast = useToast();

  if (bill.isPending) return <Splash />;
  if (bill.isError) return <Notice tone="danger">{errorMessage(bill.error)}</Notice>;
  const b = bill.data;
  if (b.status === "cancelled") return <Notice>This invoice was cancelled. Make a new one instead.</Notice>;
  return (
    <>
      <BackLink href={`/app/bills/${b.id}`} label={b.number} />
      <PageHeader title={`Edit ${b.number}`} subtitle={`For ${b.billTo.name}`} />
      <BillEditor
        key={b.id}
        bill={b}
        onSaved={() => {
          toast("Invoice saved");
          router.replace(`/app/bills/${b.id}`);
        }}
      />
    </>
  );
}
