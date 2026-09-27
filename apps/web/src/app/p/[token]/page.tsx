"use client";

import { formatDate } from "@wedding-yantra/core";
import { usePartnerPage } from "@wedding-yantra/api-client/react";
import { EVENT_LABELS, PARTNER_LEAD_STATUS_LABELS, type PartnerLeadStatus, type PartnerPage } from "@wedding-yantra/types";
import { CalendarDays, Handshake, UserX } from "lucide-react";
import { useParams } from "next/navigation";
import { BusinessMark } from "@/components/app/business-mark";
import { LogoMark } from "@/components/app/logo";
import { Card, EmptyState } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

/** A partner's own page: the enquiries their QR code brought, and where each stands. No sign-in. */
export default function PartnerPublicPage() {
  const { token } = useParams<{ token: string }>();
  const page = usePartnerPage(token);
  if (page.isPending) return <Splash />;
  if (page.isError)
    return (
      <main className="grid min-h-dvh place-items-center bg-hero px-4">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-soft">
          <EmptyState icon={UserX} title="This page isn't available" className="py-6">
            The link may be old or sharing was stopped. Please ask the business for a new link.
          </EmptyState>
        </div>
      </main>
    );
  return <View data={page.data} />;
}

const STATUS_TONE: Record<PartnerLeadStatus, string> = {
  new: "bg-sun-100 text-brand-strong",
  in_talks: "bg-cream text-ink",
  booked: "bg-success-soft text-success",
  not_booked: "bg-line text-ink-muted",
};

function View({ data }: { data: PartnerPage }) {
  return (
    <div className="min-h-dvh bg-hero">
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-col items-center text-center">
          <BusinessMark logoUrl={data.logoUrl} icon={data.businessTypeIcon} name={data.businessName} size="lg" />
          <h1 className="mt-4 font-display text-3xl font-extrabold">{data.businessName}</h1>
          <p className="mt-1 text-ink-muted">{data.businessCity}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface/80 px-4 py-1.5 text-sm font-semibold text-brand-strong ring-1 ring-sun-300/60">
            <Handshake className="size-4" /> Enquiries via {data.partnerName}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          {(
            [
              ["Scans", data.scans],
              ["Enquiries", data.enquiries],
              ["Booked", data.booked],
            ] as const
          ).map(([label, n]) => (
            <Card key={label} className="p-4 text-center">
              <p className="font-display text-3xl font-extrabold tabular">{n}</p>
              <p className="text-sm text-ink-muted">{label}</p>
            </Card>
          ))}
        </div>

        {data.leads.length === 0 ? (
          <Card>
            <EmptyState icon={Handshake} title="No enquiries yet">
              Every enquiry from your QR code shows here as soon as it comes in.
            </EmptyState>
          </Card>
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {data.leads.map((l, i) => (
              <div key={`${l.enquiredOn}-${i}`} className="flex items-start gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{l.name}</p>
                  <p className="text-sm text-ink-muted tabular">
                    {[l.phone, `Enquired ${formatDate(l.enquiredOn.slice(0, 10))}`].filter(Boolean).join(" · ")}
                  </p>
                  {(l.eventType || l.eventDate) && (
                    <p className="mt-1 inline-flex items-center gap-1 text-sm text-ink-muted">
                      <CalendarDays className="size-3.5" />
                      {[l.eventType && EVENT_LABELS[l.eventType], l.eventDate && formatDate(l.eventDate)].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", STATUS_TONE[l.status])}>{PARTNER_LEAD_STATUS_LABELS[l.status]}</span>
              </div>
            ))}
          </Card>
        )}

        <p className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-muted">
          <LogoMark className="size-4" /> Kept up to date by Wedding Yantra
        </p>
      </main>
    </div>
  );
}
