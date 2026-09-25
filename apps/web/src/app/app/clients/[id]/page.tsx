"use client";

import { can, formatPhone, whatsappLink } from "@wedding-yantra/core";
import { useClient, useEvents, useQuotes } from "@wedding-yantra/api-client/react";
import { FileText, MessageCircle, Pencil, Phone } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { EventCard } from "@/components/bookings/event-card";
import { QuoteRow } from "@/components/bookings/quote-row";
import { ClientFormSheet } from "@/components/sales/client-form-sheet";
import { LeadCard } from "@/components/sales/lead-card";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Avatar, Card, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const client = useClient(workspace.id, id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const c = client.data;
  const quotes = useQuotes(workspace.id, { clientId: id }, can(workspace.role, "quotes.view"));
  const events = useEvents(workspace.id, { clientId: id }, can(workspace.role, "events.view"));

  return (
    <>
      <BackLink href="/app/clients" label="Clients" />
      {client.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {client.isError && <Notice tone="danger">{errorMessage(client.error)}</Notice>}
      {c && (
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <Avatar name={c.name} className="size-14 text-lg" />
              <div className="min-w-0">
                <h1 className="font-display text-[clamp(24px,4vw,32px)] font-extrabold leading-tight">{c.name}</h1>
                <p className="text-ink-muted tabular">
                  {[c.phone ? formatPhone(c.phone) : null, c.city, c.email].filter(Boolean).join(" · ")}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {c.phone && (
                <>
                  <a href={whatsappLink(`Hi ${c.name.split(" ")[0]}, `, c.phone)} target="_blank" rel="noopener noreferrer" className={buttonClass()}>
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                  <a href={`tel:${c.phone}`} className={buttonClass({ variant: "secondary" })}>
                    <Phone className="size-4" /> Call
                  </a>
                </>
              )}
              {can(workspace.role, "quotes.manage") && (
                <ButtonLink href={`/app/quotes/new?clientId=${c.id}`} variant="secondary">
                  <FileText className="size-4" /> Make a quote
                </ButtonLink>
              )}
              {can(workspace.role, "clients.manage") && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit
                </Button>
              )}
            </div>
            {c.notes && <p className="mt-5 whitespace-pre-line rounded-2xl bg-cream p-4">{c.notes}</p>}
          </Card>

          {events.data && events.data.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-extrabold">Events</h2>
              <div className="space-y-3">
                {events.data.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}

          {quotes.data && quotes.data.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-extrabold">Quotes</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {quotes.data.map((q) => (
                  <QuoteRow key={q.id} quote={q} />
                ))}
              </Card>
            </section>
          )}

          <section>
            <h2 className="mb-3 font-display text-lg font-extrabold">Enquiries</h2>
            {c.leads.length === 0 ? (
              <p className="text-ink-muted">Nothing linked yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {c.leads.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} showStage />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {c && (
        <ClientFormSheet
          open={editing}
          client={c}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast("Client saved");
          }}
        />
      )}
    </>
  );
}
