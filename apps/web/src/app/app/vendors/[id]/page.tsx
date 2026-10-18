"use client";

import { can, formatMoney, formatPhone, whatsappLink } from "@wedding-yantra/core";
import { useLeadForm, usePartners, useUpdateVendor, useVendor } from "@wedding-yantra/api-client/react";
import type { Payout, Vendor } from "@wedding-yantra/types";
import { Archive, ArchiveRestore, ChevronRight, HandCoins, MessageCircle, Pencil, Phone, QrCode, Star } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { enquiryFormUrl, partnerCounts, partnerQrText, QrImage, useMakeVendorQr } from "@/components/partners/partner-qr";
import { Button, buttonClass } from "@/components/ui/button";
import { Avatar, Card, Notice } from "@/components/ui/misc";
import { QrDownloadButtons } from "@/components/ui/qr-download";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { PayoutRow } from "@/components/vendors/payouts";
import { PaySheet, PayoutSheet, VendorSheet } from "@/components/vendors/sheets";
import { errorMessage } from "@/lib/errors";

export default function VendorPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const vendor = useVendor(workspace.id, id);
  const manage = can(workspace, "expenses.approve");
  const update = useUpdateVendor(workspace.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<{ p?: Payout } | null>(null);
  const [paying, setPaying] = useState<Payout | null>(null);

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
            <h1 className="flex items-center gap-2 font-display text-[clamp(24px,4vw,32px)] font-extrabold leading-tight">
              {v.name}
              {v.preferred && <Star className="size-5 shrink-0 fill-brand text-brand" aria-label="Preferred" />}
            </h1>
            <p className="text-ink-muted tabular">{[v.service, v.phone ? formatPhone(v.phone) : null, v.city].filter(Boolean).join(" · ")}</p>
            {v.archived && <span className="mt-1 inline-block rounded-full bg-cream px-2.5 py-0.5 text-xs font-bold text-ink-subtle">Archived</span>}
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
          {manage && (
            <Button
              variant="ghost"
              loading={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: v.id, preferred: !v.preferred },
                  { onSuccess: () => toast(v.preferred ? "No longer preferred" : "Marked preferred"), onError: (err) => toast(errorMessage(err), "error") },
                )
              }
            >
              <Star className={v.preferred ? "size-4 fill-brand text-brand" : "size-4"} /> {v.preferred ? "Preferred" : "Mark preferred"}
            </Button>
          )}
        </div>
        {v.notes && <p className="mt-5 whitespace-pre-line rounded-2xl bg-cream p-4">{v.notes}</p>}
      </Card>

      <VendorDetails vendor={v} />

      {can(workspace, "leads.view_all") && !v.archived && <VendorQrCard vendor={v} />}

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
          <Button
            variant="ghost"
            size="sm"
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { id: v.id, archived: !v.archived },
                {
                  onSuccess: () => toast(v.archived ? "Brought back" : "Archived. Their payouts stay in your expenses."),
                  onError: (err) => toast(errorMessage(err), "error"),
                },
              )
            }
          >
            {v.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {v.archived ? "Bring back" : "Archive vendor"}
          </Button>
        </div>
      )}

      <VendorSheet open={editing} onClose={() => setEditing(false)} vendor={v} onSaved={() => setEditing(false)} />
      <PayoutSheet open={sheet !== null} onClose={() => setSheet(null)} payout={sheet?.p} vendorId={v.id} />
      <PaySheet payout={paying} onClose={() => setPaying(null)} />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular">{children}</dd>
    </div>
  );
}

/** Contact and payment details, from the vendor master. */
function VendorDetails({ vendor: v }: { vendor: Vendor }) {
  if (!v.contactPerson && !v.city && !v.upiId && !v.bankAccount && !v.ifsc && !v.gstin) return null;
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-lg font-extrabold">Details</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] sm:grid-cols-3">
        <Detail label="Contact person">{v.contactPerson}</Detail>
        <Detail label="City">{v.city}</Detail>
        <Detail label="UPI ID">{v.upiId}</Detail>
        <Detail label="Bank account">{v.bankAccount}</Detail>
        <Detail label="IFSC">{v.ifsc}</Detail>
        <Detail label="GST number">{v.gstin}</Detail>
      </dl>
    </Card>
  );
}

/** The vendor's own enquiry QR code: enquiries through it are marked as theirs. */
function VendorQrCard({ vendor: v }: { vendor: Vendor }) {
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const partners = usePartners(workspace.id);
  const form = useLeadForm(workspace.id);
  const { make, making } = useMakeVendorQr((p) => router.push(`/app/partners/${p.id}`));
  if (!partners.data || !form.data) return null;
  const p = partners.data.find((x) => x.vendorId === v.id);
  const first = v.name.split(" ")[0];

  if (!p)
    return (
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cream text-brand-strong">
          <QrCode className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-extrabold">Enquiry QR code</h2>
          <p className="text-sm text-ink-muted">Give {v.name} their own QR code for their counter. Enquiries from it are marked as theirs.</p>
        </div>
        <Button loading={making === v.id} onClick={() => void make(v)}>
          <QrCode className="size-4" /> Make their QR code
        </Button>
      </Card>
    );

  const url = enquiryFormUrl(form.data.slug, p.code);
  const print = partnerQrText(workspace.name, p);
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg font-extrabold">Enquiry QR code</h2>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <QrImage text={url} label={`QR code for ${v.name}`} className="size-32" />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm text-ink-muted">{partnerCounts(p)} through {first}&apos;s QR code.</p>
          <QrDownloadButtons text={url} filename={print.filename} title={print.title} subtitle={print.subtitle} size="sm" />
          <Link href={`/app/partners/${p.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-brand-strong">
            Their enquiries and page <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
    </Card>
  );
}
