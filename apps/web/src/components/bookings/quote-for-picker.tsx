"use client";

import { can, formatPhone, leadScope } from "@wedding-yantra/core";
import { useClients, useCreateLead, useLeads } from "@wedding-yantra/api-client/react";
import { createLeadInput } from "@wedding-yantra/types";
import { ChevronRight, Inbox, Plus, Search, UserRound } from "lucide-react";
import { useDeferredValue, useState, type FormEvent, type ReactNode } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { PhoneMatchNote } from "@/components/sales/phone-match";
import { Button } from "@/components/ui/button";
import { PhoneField, TextField } from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export type QuoteFor = { leadId: string } | { clientId: string };

/**
 * "Who is this quote for?": find an enquiry or a client by name or number, or add a new
 * enquiry right here. Shows only what the viewer may see.
 */
export function QuoteForPicker({ onPick }: { onPick: (who: QuoteFor) => void }) {
  const { workspace } = useCurrentWorkspace();
  const seesLeads = leadScope(workspace) !== "none";
  const seesClients = can(workspace, "clients.view");
  const canAddLead = can(workspace, "leads.work");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const typed = search.trim();
  // One letter matches too much: keep showing the recent ones until there are two.
  const q = useDeferredValue(typed.length >= 2 ? typed : "");
  const leads = useLeads(workspace.id, q ? { q } : {}, seesLeads);
  const clients = useClients(workspace.id, q, false, seesClients);
  const limit = q ? 8 : 4;

  const leadRows = (leads.data?.leads ?? [])
    .filter((l) => l.stageKind !== "lost")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
  const clientRows = (clients.data ?? []).slice(0, limit);
  const loading = (seesLeads && leads.isPending) || (seesClients && clients.isPending);

  if (!seesLeads && !seesClients && !canAddLead) {
    return <Notice>Quotes are made for an enquiry or a client. Ask the owner to give you the Leads or Clients screen.</Notice>;
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="font-display text-lg font-extrabold">Who is this quote for?</h2>

      {adding ? (
        <NewEnquiry onCancel={() => setAdding(false)} onCreated={(leadId) => onPick({ leadId })} startName={/\d/.test(typed) ? "" : typed} />
      ) : (
        <>
          {(seesLeads || seesClients) && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
              <input
                type="search"
                aria-label="Search by name or number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or number"
                autoComplete="off"
                className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-base placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none"
              />
            </div>
          )}

          {loading && leadRows.length === 0 && clientRows.length === 0 ? (
            <div className="flex justify-center py-4 text-brand">
              <Spinner />
            </div>
          ) : (
            <>
              {leadRows.length > 0 && (
                <Group title={q ? "Enquiries" : "Recent enquiries"}>
                  {leadRows.map((l) => (
                    <Row key={l.id} icon="lead" name={l.name} detail={[l.stageName, l.phone && formatPhone(l.phone)].filter(Boolean).join(" · ")} onClick={() => onPick({ leadId: l.id })} />
                  ))}
                </Group>
              )}
              {clientRows.length > 0 && (
                <Group title="Clients">
                  {clientRows.map((c) => (
                    <Row key={c.id} icon="client" name={c.name} detail={c.phone ? formatPhone(c.phone) : ""} onClick={() => onPick({ clientId: c.id })} />
                  ))}
                </Group>
              )}
              {q && leadRows.length === 0 && clientRows.length === 0 && <p className="text-sm text-ink-muted">Nobody matches &ldquo;{typed}&rdquo;.</p>}
            </>
          )}

          {canAddLead && (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> New enquiry
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-muted">{title}</p>
      <div className="-mx-2">{children}</div>
    </div>
  );
}

function Row({ icon, name, detail, onClick }: { icon: "lead" | "client"; name: string; detail: string; onClick: () => void }) {
  const Icon = icon === "lead" ? Inbox : UserRound;
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-cream">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name}</span>
        {detail && <span className="block truncate text-sm text-ink-muted">{detail}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
    </button>
  );
}

/** A name and a number are enough: it's saved as a new enquiry and the quote is made for it. */
function NewEnquiry({ startName, onCancel, onCreated }: { startName: string; onCancel: () => void; onCreated: (leadId: string) => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateLead(workspace.id);
  const [name, setName] = useState(startName);
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = { name, phone };
    const check = validate(createLeadInput, payload);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const lead = await create.mutateAsync(payload);
      onCreated(lead.id);
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Neha Kapoor" autoFocus />
      <div className="space-y-2">
        <PhoneField label="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        <PhoneMatchNote phone={phone} />
      </div>
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={create.isPending}>
          Next: the quote
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Back to search
        </Button>
      </div>
    </form>
  );
}
