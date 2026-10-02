"use client";

import { can } from "@wedding-yantra/core";
import { useClient, useLead } from "@wedding-yantra/api-client/react";
import { EVENT_LABELS, type Quote } from "@wedding-yantra/types";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { DateCheck } from "@/components/bookings/date-check";
import { QuoteEditor } from "@/components/bookings/quote-editor";
import { QuoteForPicker } from "@/components/bookings/quote-for-picker";
import { QuoteSaved } from "@/components/bookings/quote-saved";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";

function NewQuote() {
  const params = useSearchParams();
  const leadId = params.get("leadId");
  const clientId = params.get("clientId");
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const lead = useLead(workspace.id, leadId ?? "");
  const client = useClient(workspace.id, clientId ?? "");
  const [saved, setSaved] = useState<Quote | null>(null);

  if (!can(workspace, "quotes.manage")) return <Notice>Making quotes isn&apos;t on your screens. Ask the owner if you need it.</Notice>;
  if (!leadId && !clientId) {
    return (
      <>
        <BackLink href="/app/money/quotes" label="Quotes" />
        <PageHeader title="New quote" />
        <QuoteForPicker
          onPick={(who) => router.replace(`/app/quotes/new?${"leadId" in who ? `leadId=${who.leadId}` : `clientId=${who.clientId}`}`)}
        />
      </>
    );
  }
  const loading = (leadId && lead.isPending) || (clientId && !leadId && client.isPending);
  if (loading) return <Splash />;

  const name = lead.data?.name ?? client.data?.name ?? "your client";
  const eventLabel = lead.data?.eventType ? EVENT_LABELS[lead.data.eventType] : null;
  const back = leadId ? `/app/leads/${leadId}` : `/app/clients/${clientId}`;

  if (saved) {
    return (
      <>
        <BackLink href={back} label={name} />
        <QuoteSaved quote={saved} />
      </>
    );
  }

  return (
    <>
      <BackLink href={back} label={name} />
      <PageHeader title="New quote" subtitle={`For ${name}`} />
      {lead.data?.eventDate && lead.data.stageKind === "open" && (
        <DateCheck dates={[lead.data.eventDate]} excludeEventId={lead.data.eventId} className="-mt-2 mb-5" />
      )}
      <QuoteEditor
        leadId={leadId}
        clientId={clientId}
        defaultTitle={eventLabel ? `${eventLabel} quote` : `Quote for ${name}`}
        onSaved={(quote) => {
          setSaved(quote);
          window.scrollTo({ top: 0 });
        }}
      />
    </>
  );
}

export default function NewQuotePage() {
  return (
    <Suspense fallback={<Splash />}>
      <NewQuote />
    </Suspense>
  );
}
