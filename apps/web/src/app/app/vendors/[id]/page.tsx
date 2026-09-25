"use client";

import { can, formatMoney, formatPhone, whatsappLink } from "@wedding-yantra/core";
import { useDeleteVendor, useVendor } from "@wedding-yantra/api-client/react";
import type { Payout } from "@wedding-yantra/types";
import { HandCoins, MessageCircle, Pencil, Phone } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Avatar, Card, Notice } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { PayoutRow } from "@/components/vendors/payouts";
import { PaySheet, PayoutSheet, VendorSheet } from "@/components/vendors/sheets";
import { errorMessage } from "@/lib/errors";

export default function VendorPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const vendor = useVendor(workspace.id, id);
  const manage = can(workspace.role, "expenses.approve");
  const remove = useDeleteVendor(workspace.id);
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<{ p?: Payout } | null>(null);
  const [paying, setPaying] = useState<Payout | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (vendor.isPending) return <Splash />;
  if (vendor.isError)
    return (
      <>
        <BackLink href="/app/vendors" label="Vendors" />
        <Notice tone="danger">{errorMessage(vendor.error)}</Notice>
      </>
    );
  const v = vendor.data;

  return (
    <div className="space-y-6">
      <BackLink href="/app/vendors" label="Vendors" />
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Avatar name={v.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(24px,4vw,32px)] font-extrabold leading-tight">{v.name}</h1>
            <p className="text-ink-muted tabular">{[v.service, v.phone ? formatPhone(v.phone) : null, v.upiId].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-cream p-4">
            <p className="text-xs font-semibold text-ink-muted">To pay</p>
            <p className="font-display text-2xl font-extrabold tabular">{formatMoney(v.owed)}</p>
          </div>
          <div className="rounded-2xl bg-cream p-4">
            <p className="text-xs font-semibold text-ink-muted">Paid so far</p>
            <p className="font-display text-2xl font-extrabold tabular text-success">{formatMoney(v.paid)}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {v.phone && (
            <>
              <a href={whatsappLink(`Hi ${v.name.split(" ")[0]}, `, v.phone)} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <a href={`tel:${v.phone}`} className={buttonClass({ variant: "secondary" })}>
                <Phone className="size-4" /> Call
              </a>
            </>
          )}
          {manage && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </Button>
          )}
        </div>
        {v.notes && <p className="mt-5 whitespace-pre-line rounded-2xl bg-cream p-4">{v.notes}</p>}
      </Card>

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">Payouts</h2>
        {v.payouts.length === 0 ? (
          <p className="text-ink-muted">Nothing noted yet.</p>
        ) : (
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {v.payouts.map((p) => (
                <PayoutRow key={p.id} p={p} show="vendor" onOpen={(x) => manage && setSheet({ p: x })} onPay={manage ? setPaying : undefined} />
              ))}
            </ul>
          </Card>
        )}
        {manage && (
          <Button variant="secondary" className="mt-3" onClick={() => setSheet({})}>
            <HandCoins className="size-4" /> Add what you owe {v.name.split(" ")[0]}
          </Button>
        )}
      </section>

      {manage && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {confirm ? (
            <>
              <p className="text-sm text-ink-muted">Remove {v.name}? Their past payouts stay in your expenses.</p>
              <Button
                variant="destructive"
                size="sm"
                loading={remove.isPending}
                onClick={async () => {
                  try {
                    await remove.mutateAsync(v.id);
                    toast("Vendor removed");
                    router.replace("/app/vendors");
                  } catch (err) {
                    toast(errorMessage(err), "error");
                    setConfirm(false);
                  }
                }}
              >
                Remove
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>
              Remove vendor
            </Button>
          )}
        </div>
      )}

      <VendorSheet open={editing} onClose={() => setEditing(false)} vendor={v} onSaved={() => setEditing(false)} />
      <PayoutSheet open={sheet !== null} onClose={() => setSheet(null)} payout={sheet?.p} vendorId={v.id} />
      <PaySheet payout={paying} onClose={() => setPaying(null)} />
    </div>
  );
}
