"use client";

import { can, leadScope } from "@wedding-yantra/core";
import { useClient, useLead } from "@wedding-yantra/api-client/react";
import { EVENT_LABELS } from "@wedding-yantra/types";
import { FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { QuoteEditor } from "@/components/bookings/quote-editor";
import { ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

function NewQuote() {
  const params = useSearchParams();
  const leadId = params.get("leadId");
  const clientId = params.get("clientId");
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const toast = useToast();
  const lead = useLead(workspace.id, leadId ?? "");
  const client = useClient(workspace.id, clientId ?? "");

  if (!can(workspace, "quotes.manage")) return <Notice>Making quotes isn&apos;t on your screens. Ask the owner if you need it.</Notice>;
  if (!leadId && !clientId) {
    const seesLeads = leadScope(workspace) !== "none";
    const seesClients = can(workspace, "clients.view");
    return (
      <>
        <PageHeader title="New quote" />
        <Card>
          <EmptyState
            icon={FileText}
            title="Choose who the quote is for"
            action={
              (seesLeads || seesClients) && (
                <div className="flex flex-wrap justify-center gap-2">
                  {seesLeads && <ButtonLink href="/app/leads">Open a lead</ButtonLink>}
                  {seesClients && (
                    <ButtonLink href="/app/clients" variant={seesLeads ? "secondary" : undefined}>
                      Open a client
                    </ButtonLink>
                  )}
                </div>
              )
            }
          >
            Open the lead or client, then tap Make a quote.
          </EmptyState>
        </Card>
      </>
    );
  }
  const loading = (leadId && lead.isPending) || (clientId && !leadId && client.isPending);
  if (loading) return <Splash />;

  const name = lead.data?.name ?? client.data?.name ?? "your client";
  const eventLabel = lead.data?.eventType ? EVENT_LABELS[lead.data.eventType] : null;
  const back = leadId ? `/app/leads/${leadId}` : `/app/clients/${clientId}`;

  return (
    <>
      <BackLink href={back} label={name} />
      <PageHeader title="New quote" subtitle={`For ${name}`} />
      <QuoteEditor
        leadId={leadId}
        clientId={clientId}
        defaultTitle={eventLabel ? `${eventLabel} quote` : `Quote for ${name}`}
        onSaved={(quote) => {
          toast(`Quote ${quote.number} saved`);
          router.replace(`/app/quotes/${quote.id}`);
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
