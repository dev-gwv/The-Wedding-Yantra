"use client";

import { can, formatDate } from "@wedding-yantra/core";
import { usePartners } from "@wedding-yantra/api-client/react";
import { ChevronRight, Handshake, Lock, Plus, QrCode } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { PartnerFormSheet } from "@/components/partners/partner-form-sheet";
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
  const [adding, setAdding] = useState(false);
  const router = useRouter();

  if (!allowed)
    return (
      <>
        <BackLink href="/app/settings" label="Settings" />
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
      <BackLink href="/app/settings" label="Settings" />
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
                <Link key={p.id} href={`/app/partners/${p.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
                    <Handshake className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{p.name}</p>
                    <p className="truncate text-sm text-ink-muted">
                      {[p.label, `${p.scans} scan${p.scans === 1 ? "" : "s"}`, `${p.enquiries} enquir${p.enquiries === 1 ? "y" : "ies"}`, p.booked ? `${p.booked} booked` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {p.lastEnquiryAt && <span className="hidden shrink-0 text-xs text-ink-muted sm:block">Last {formatDate(p.lastEnquiryAt.slice(0, 10))}</span>}
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                </Link>
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
