"use client";

import { can, formatDate, formatPhone, whatsappLink } from "@wedding-yantra/core";
import { useBills, useClient, useEvents, useQuotes, useUpdateClient } from "@wedding-yantra/api-client/react";
import { SOURCE_LABELS, type Client } from "@wedding-yantra/types";
import { Archive, ArchiveRestore, FilePlus2, FileText, MessageCircle, Pencil, Phone } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { CustomFieldList } from "@/components/app/custom-fields";
import { useOptionList } from "@/components/app/option-picker";
import { EventCard } from "@/components/bookings/event-card";
import { QuoteRow } from "@/components/bookings/quote-row";
import { PortalCard } from "@/components/grow/portal-card";
import { BillRow } from "@/components/money/rows";
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
  const relations = useOptionList("relation");
  const c = client.data;
  const quotes = useQuotes(workspace.id, { clientId: id }, can(workspace.role, "quotes.view"));
  const events = useEvents(workspace.id, { clientId: id }, can(workspace.role, "events.view"));
  const bills = useBills(workspace.id, { clientId: id }, can(workspace.role, "finance.view"));

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
                <p className="mt-1 flex flex-wrap gap-1.5 text-xs font-bold">
                  {c.relation && <span className="rounded-full bg-cream px-2.5 py-0.5 text-ink">{relations.labelOf(c.relation)}</span>}
                  {c.weddingDate && <span className="rounded-full bg-sun-50 px-2.5 py-0.5 text-brand-strong">{formatDate(c.weddingDate)}</span>}
                  {c.source && <span className="rounded-full bg-cream px-2.5 py-0.5 text-ink-muted">From {SOURCE_LABELS[c.source]}</span>}
                  {c.archived && <span className="rounded-full bg-cream px-2.5 py-0.5 text-ink-subtle">Archived</span>}
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
              {can(workspace.role, "bills.manage") && (
                <ButtonLink href={`/app/bills/new?clientId=${c.id}`} variant="secondary">
                  <FilePlus2 className="size-4" /> Make invoice
                </ButtonLink>
              )}
              {can(workspace.role, "clients.manage") && (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit
                </Button>
              )}
              {can(workspace.role, "clients.manage") && <ArchiveButton client={c} />}
            </div>
            <CustomFieldList entity="client" values={c.custom} className="mt-5" />
            {c.notes && <p className="mt-5 whitespace-pre-line rounded-2xl bg-cream p-4">{c.notes}</p>}
          </Card>

          <MasterDetails client={c} />

          {can(workspace.role, "clients.manage") && <PortalCard client={c} business={workspace.name} />}

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

          {bills.data && bills.data.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-extrabold">Invoices</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {bills.data.map((b) => (
                  <BillRow key={b.id} bill={b} showClient={false} />
                ))}
              </Card>
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

          {c.referredLeads.length > 0 && <Referred client={c} />}

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

/** Enquiries this client sent your way. */
function Referred({ client }: { client: Client }) {
  const leads = client.referredLeads;
  const booked = leads.filter((l) => l.stageKind === "won").length;
  return (
    <section>
      <h2 className="font-display text-lg font-extrabold">Sent your way</h2>
      <p className="mb-3 text-sm text-ink-muted">
        {client.name.split(" ")[0]} referred {leads.length === 1 ? "this enquiry" : `${leads.length} enquiries`}
        {booked > 0 ? `, and ${booked} booked` : ""}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} showStage />
        ))}
      </div>
    </section>
  );
}

function ArchiveButton({ client }: { client: Client }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateClient(workspace.id, client.id);
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      loading={update.isPending}
      onClick={() =>
        update.mutate(
          { archived: !client.archived },
          { onSuccess: () => toast(client.archived ? "Brought back" : "Archived. Their events and invoices stay."), onError: (err) => toast(errorMessage(err), "error") },
        )
      }
    >
      {client.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {client.archived ? "Bring back" : "Archive"}
    </Button>
  );
}

/** A labelled value, left out when empty. */
function Item({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

/** Emergency contacts and the wedding, from the client master. */
function MasterDetails({ client: c }: { client: Client }) {
  const relations = useOptionList("relation");
  const w = c.wedding;
  const hasWedding = w.brideName || w.groomName || w.guestCount !== null;
  if (!c.contacts.length && !hasWedding) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {c.contacts.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="px-5 pt-4 font-display text-lg font-extrabold">Emergency contacts</h2>
          <p className="px-5 text-sm text-ink-muted">When {c.name.split(" ")[0]} can&apos;t be reached</p>
          <ul className="mt-2 divide-y divide-line">
            {c.contacts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar name={p.name} className="size-9 text-xs" />
                <span className="min-w-[9rem] flex-1">
                  <span className="block font-bold">
                    {p.name}
                    {p.relation && <span className="font-semibold text-ink-muted"> · {relations.labelOf(p.relation)}</span>}
                  </span>
                  {p.phone && <span className="block text-sm text-ink-muted tabular">{formatPhone(p.phone)}</span>}
                </span>
                {p.phone && (
                  <span className="flex gap-1">
                    <a href={whatsappLink(`Hi ${p.name.split(" ")[0]}, `, p.phone)} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
                      <MessageCircle className="size-4" /> WhatsApp
                    </a>
                    <a href={`tel:${p.phone}`} className={buttonClass({ variant: "ghost", size: "sm" })} aria-label={`Call ${p.name}`}>
                      <Phone className="size-4" />
                    </a>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {hasWedding && (
        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-extrabold">The wedding</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px]">
            <Item label="Bride">{w.brideName}</Item>
            <Item label="Groom">{w.groomName}</Item>
            <Item label="Guests">{w.guestCount !== null ? w.guestCount.toLocaleString("en-IN") : null}</Item>
            <Item label="Wedding date">{c.weddingDate ? formatDate(c.weddingDate) : null}</Item>
          </dl>
        </Card>
      )}
    </div>
  );
}
