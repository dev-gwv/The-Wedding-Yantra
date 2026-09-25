"use client";

import { can, formatPhone } from "@wedding-yantra/core";
import { useClients } from "@wedding-yantra/api-client/react";
import { ChevronRight, Lock, Plus, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ClientFormSheet } from "@/components/sales/client-form-sheet";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";

export default function ClientsPage() {
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const canView = can(workspace.role, "clients.view");
  const clients = useClients(workspace.id, q);
  const [adding, setAdding] = useState(false);
  const canManage = can(workspace.role, "clients.manage");

  if (!canView) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Clients" />
        <Card>
          <EmptyState icon={Lock} title="Clients aren't part of your role">
            Ask the owner if you need to see client details.
          </EmptyState>
        </Card>
      </>
    );
  }

  const empty = clients.data && clients.data.length === 0 && !q;

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title="Clients"
        subtitle="People who booked with you. Booked leads are added automatically."
        action={
          canManage && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" strokeWidth={2.5} /> Add client
            </Button>
          )
        }
      />
      {!empty && (
        <label className="relative mb-5 block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <span className="sr-only">Search clients</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or number"
            className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-[15px] placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none"
          />
        </label>
      )}
      {clients.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {clients.isError && <Notice tone="danger">{errorMessage(clients.error)}</Notice>}
      {empty && (
        <Card>
          <EmptyState icon={UsersRound} title="No clients yet">
            When you mark a lead as Booked, they appear here with every enquiry and booking in one place.
          </EmptyState>
        </Card>
      )}
      {clients.data && clients.data.length > 0 && (
        <Card className="divide-y divide-line overflow-hidden">
          {clients.data.map((c) => (
            <Link key={c.id} href={`/app/clients/${c.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream">
              <Avatar name={c.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{c.name}</span>
                <span className="block truncate text-sm text-ink-muted tabular">
                  {[c.phone ? formatPhone(c.phone) : null, c.city].filter(Boolean).join(" · ") || "No contact details"}
                </span>
              </span>
              {c.leadCount > 0 && (
                <span className="text-sm font-semibold text-ink-muted">
                  {c.leadCount} {c.leadCount === 1 ? "enquiry" : "enquiries"}
                </span>
              )}
              <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
            </Link>
          ))}
        </Card>
      )}
      {clients.data && clients.data.length === 0 && q && (
        <p className="py-12 text-center text-ink-muted">No clients match &ldquo;{q}&rdquo;.</p>
      )}
      <ClientFormSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(client) => {
          setAdding(false);
          router.push(`/app/clients/${client.id}`);
        }}
      />
    </>
  );
}
