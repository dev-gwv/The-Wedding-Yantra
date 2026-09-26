"use client";

import { billMessage, can, whatsappLink } from "@wedding-yantra/core";
import { useBill, useCancelBill, useWorkspace } from "@wedding-yantra/api-client/react";
import type { Bill, Payment, Workspace } from "@wedding-yantra/types";
import { Copy, IndianRupee, MessageCircle, Pencil, Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { BillDocument } from "@/components/money/bill-document";
import { PaymentRow, PaymentSheet } from "@/components/money/payment-sheet";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";
import { billUrl } from "@/lib/links";

export default function BillPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const bill = useBill(workspace.id, id);
  const details = useWorkspace(workspace.id);

  if (bill.isPending || details.isPending) return <Splash />;
  if (bill.isError) return <Notice tone="danger">{errorMessage(bill.error)}</Notice>;
  if (details.isError) return <Notice tone="danger">{errorMessage(details.error)}</Notice>;
  return <BillView bill={bill.data} business={details.data} />;
}

function BillView({ bill, business }: { bill: Bill; business: Workspace }) {
  const { workspace } = useCurrentWorkspace();
  const cancel = useCancelBill(workspace.id, bill.id);
  const toast = useToast();
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const manage = can(workspace.role, "bills.manage");
  const record = can(workspace.role, "payments.record");
  const cancelled = bill.status === "cancelled";
  const url = billUrl(bill.shareToken);
  const back = bill.eventId ? `/app/events/${bill.eventId}` : bill.clientId ? `/app/clients/${bill.clientId}` : "/app/money";
  const message = billMessage({
    clientName: bill.billTo.name,
    business: business.name,
    number: bill.number,
    total: bill.total,
    due: bill.due,
    dueDate: bill.dueDate,
    link: url,
    payOnline: !!business.upiId,
  });
  const who = { clientName: bill.billTo.name, clientPhone: bill.billTo.phone, billLink: url };

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  }

  async function cancelIt() {
    try {
      await cancel.mutateAsync(reason.trim() || undefined);
      toast("Invoice cancelled");
      setCancelling(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <BackLink href={back} label={bill.eventTitle ?? bill.clientName} />
      </div>

      {!cancelled && (manage || record) && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <a href={whatsappLink(message, bill.billTo.phone ?? undefined)} target="_blank" rel="noopener noreferrer" className={buttonClass()}>
            <MessageCircle className="size-4" /> Send on WhatsApp
          </a>
          {record && bill.due > 0 && (
            <Button variant="secondary" onClick={() => setRecording(true)}>
              <IndianRupee className="size-4" /> Money received
            </Button>
          )}
          <Button variant="secondary" onClick={copy}>
            <Copy className="size-4" /> Copy link
          </Button>
          {manage && (
            <ButtonLink href={`/app/bills/${bill.id}/edit`} variant="secondary">
              <Pencil className="size-4" /> Edit
            </ButtonLink>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> Save as PDF
          </Button>
        </div>
      )}

      {!business.upiId && !cancelled && bill.due > 0 && manage && (
        <div className="print:hidden">
          <Notice>
            Add your UPI ID in Business profile, and clients get a Pay button on this invoice&apos;s link.
          </Notice>
        </div>
      )}

      <BillDocument
        business={{
          name: business.name,
          typeName: business.businessTypeName,
          icon: business.businessTypeIcon,
          city: business.city,
          phone: business.phone,
          email: business.email,
          address: business.address,
          logoUrl: business.logoUrl,
        }}
        bill={bill}
      />

      {bill.payments.length > 0 && (
        <section className="print:hidden">
          <h2 className="mb-3 font-display text-lg font-extrabold">Received</h2>
          <Card className="divide-y divide-line overflow-hidden">
            {bill.payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onClick={() => setEditing(p)} />
            ))}
          </Card>
        </section>
      )}

      {manage && !cancelled && (
        <div className="border-t border-line pt-5 print:hidden">
          <Button variant="danger" size="sm" onClick={() => setCancelling(true)}>
            Cancel this invoice
          </Button>
        </div>
      )}

      <PaymentSheet open={recording} onClose={() => setRecording(false)} target={{ billId: bill.id }} due={bill.due} who={who} />
      <PaymentSheet open={!!editing} onClose={() => setEditing(null)} payment={editing ?? undefined} due={bill.due} who={who} />
      <Sheet
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={`Cancel ${bill.number}?`}
        description="The number stays used, as GST rules need. Money received on it moves to the next invoice for this event."
      >
        <div className="space-y-4">
          <TextField label="Why? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong amount" />
          <Button variant="destructive" size="lg" onClick={cancelIt} loading={cancel.isPending}>
            Cancel invoice
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
