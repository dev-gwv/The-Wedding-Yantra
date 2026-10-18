"use client";

import { can } from "@wedding-yantra/core";
import { useLeadForm, usePartners } from "@wedding-yantra/api-client/react";
import { Lock, Plus, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { ENQUIRY_FORM_PATH } from "@/components/app/lead-sections";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { PartnerFormSheet } from "@/components/partners/partner-form-sheet";
import { PartnerQrRow } from "@/components/partners/partner-qr";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/** Collaborations: each partner has their own QR code, and their enquiries are credited to them. */
export default function PartnersPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace, "leads.view_all");
  const [archived, setArchived] = useState(false);
  const partners = usePartners(workspace.id, allowed, archived);
  const form = useLeadForm(workspace.id, allowed);
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  if (!allowed)
    return (
      <>
        <BackLink href="/app/leads" label="Leads" />
        <PageHeader title="Partner QR codes" />
        <Card>
          <EmptyState icon={Lock} title="Partner QR codes aren't on your screens">
            Ask the owner if you need them.
          </EmptyState>
        </Card>
      </>
    );

  const all = partners.data ?? [];
  const totals = all.reduce((a, p) => ({ scans: a.scans + p.scans, enquiries: a.enquiries + p.enquiries, booked: a.booked + p.booked }), { scans: 0, enquiries: 0, booked: 0 });

  return (
    <>
      <BackLink href={ENQUIRY_FORM_PATH} label="Enquiry form & QR codes" />
      <PageHeader
        title="Partner QR codes"
        subtitle="Give each partner you collaborate with their own QR code. Every enquiry through it is credited to them, and they see their enquiries on their own page."
        action={
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add partner
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            [false, "Partners"],
            [true, "Archived"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={archived === value}
            onClick={() => setArchived(value)}
            className={cn("h-9 rounded-full px-4 text-sm font-bold", archived === value ? "bg-ink text-surface" : "border border-line bg-surface text-ink hover:bg-cream")}
          >
            {label}
          </button>
        ))}
      </div>

      {partners.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {partners.isError && <Notice tone="danger">{errorMessage(partners.error)}</Notice>}

      {partners.data &&
        (all.length === 0 ? (
          <Card>
            <EmptyState
              icon={QrCode}
              title={archived ? "No archived partners" : "No partners yet"}
              action={!archived && <Button onClick={() => setAdding(true)}>Add your first partner</Button>}
            >
              {archived
                ? "Partnerships you end show here. Their QR codes still open your form."
                : "A boutique, jeweller, salon or venue you work with keeps your QR code at their counter. You see which enquiries they sent; they see them too."}
            </EmptyState>
          </Card>
        ) : (
          <>
            {!archived && (
              <div className="mb-4 grid grid-cols-3 gap-3">
                {(
                  [
                    ["Scans", totals.scans],
                    ["Enquiries", totals.enquiries],
                    ["Booked", totals.booked],
                  ] as const
                ).map(([label, n]) => (
                  <Card key={label} className="p-4">
                    <p className="font-display text-2xl font-extrabold tabular">{n}</p>
                    <p className="text-sm text-ink-muted">{label}</p>
                  </Card>
                ))}
              </div>
            )}
            <Card className="divide-y divide-line overflow-hidden">
              {all.map((p) => (
                <PartnerQrRow key={p.id} p={p} slug={form.data?.slug ?? null} />
              ))}
            </Card>
          </>
        ))}

      <PartnerFormSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(p) => {
          setAdding(false);
          router.push(`/app/partners/${p.id}`);
        }}
      />
    </>
  );
}
