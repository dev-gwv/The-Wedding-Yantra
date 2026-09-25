"use client";

import { can, whatsappLink } from "@wedding-yantra/core";
import { useQuote, useQuoteAction, useWorkspace } from "@wedding-yantra/api-client/react";
import type { Quote, Workspace } from "@wedding-yantra/types";
import { CalendarDays, CircleCheck, Copy, MessageCircle, Pencil, Printer, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { QuoteDocument } from "@/components/bookings/quote-document";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

export default function QuotePage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const quote = useQuote(workspace.id, id);
  const details = useWorkspace(workspace.id);

  if (quote.isPending || details.isPending) return <Splash />;
  if (quote.isError) return <Notice tone="danger">{errorMessage(quote.error)}</Notice>;
  if (details.isError) return <Notice tone="danger">{errorMessage(details.error)}</Notice>;
  return <QuoteView quote={quote.data} business={details.data} />;
}

function QuoteView({ quote, business }: { quote: Quote; business: Workspace }) {
  const { workspace } = useCurrentWorkspace();
  const act = useQuoteAction(workspace.id, quote.id);
  const toast = useToast();
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmAccept, setConfirmAccept] = useState(false);
  const canManage = can(workspace.role, "quotes.manage");
  const open = quote.status === "draft" || quote.status === "sent";
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/q/${quote.shareToken}`;
  const first = quote.customerName.split(" ")[0];
  const message = `Hi ${first}, here is your quote ${quote.number} from ${business.name}. You can see the details and accept it here: ${url}`;
  const back = quote.leadId ? `/app/leads/${quote.leadId}` : quote.clientId ? `/app/clients/${quote.clientId}` : "/app/money";

  /** Runs an action and says how it went. Resolves to true when it worked. */
  async function run(action: Parameters<typeof act.mutateAsync>[0], done: string) {
    try {
      await act.mutateAsync(action);
      toast(done);
      return true;
    } catch (err) {
      toast(errorMessage(err), "error");
      return false;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
    toast("Link copied");
    // Sharing the link is sending it.
    if (quote.status === "draft") act.mutate({ kind: "send" });
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <BackLink href={back} label={quote.customerName} />
      </div>

      {canManage && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {open && (
            <a
              href={whatsappLink(message, quote.customerPhone ?? undefined)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass()}
              onClick={() => quote.status === "draft" && act.mutate({ kind: "send" })}
            >
              <MessageCircle className="size-4" /> Send on WhatsApp
            </a>
          )}
          {open && (
            <Button variant="secondary" onClick={copy}>
              <Copy className="size-4" /> Copy link
            </Button>
          )}
          {open && (
            <ButtonLink href={`/app/quotes/${quote.id}/edit`} variant="secondary">
              <Pencil className="size-4" /> Edit
            </ButtonLink>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="size-4" /> Save as PDF
          </Button>
        </div>
      )}

      {quote.expired && open && (
        <div className="print:hidden">
          <Notice tone="warning">This quote has passed its valid-until date. Edit it to give a new date, then send it again.</Notice>
        </div>
      )}

      {quote.status === "accepted" && quote.eventId && (
        <Link
          href={`/app/events/${quote.eventId}`}
          className="flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 font-semibold text-success print:hidden"
        >
          <CalendarDays className="size-5" /> Booked. See the event and add the other functions
        </Link>
      )}

      <QuoteDocument
        business={{
          name: business.name,
          typeName: business.businessTypeName,
          icon: business.businessTypeIcon,
          city: business.city,
          phone: business.phone,
          email: business.email,
          address: business.address,
          gstin: business.gstin,
        }}
        quote={quote}
      />

      {canManage && open && (
        <section className="rounded-3xl border border-line p-5 print:hidden">
          <h2 className="font-display text-lg font-extrabold">Did they answer on call or WhatsApp?</h2>
          <p className="mt-1 text-sm text-ink-muted">Clients can accept on the link themselves. If they told you instead, mark it here.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setConfirmAccept(true)} className="text-success">
              <CircleCheck className="size-4" /> Mark accepted
            </Button>
            <Button variant="ghost" onClick={() => setDeclining(true)}>
              <XCircle className="size-4" /> Mark declined
            </Button>
            {quote.status === "draft" && (
              <Button
                variant="danger"
                loading={act.isPending}
                onClick={async () => {
                  if (await run({ kind: "delete" }, "Quote deleted")) router.replace(back);
                }}
              >
                Delete draft
              </Button>
            )}
          </div>
        </section>
      )}

      <Sheet open={confirmAccept} onClose={() => setConfirmAccept(false)} title="Mark as accepted?" description="This books the job: the lead moves to Booked, the client is saved and an event is created.">
        <Button
          size="lg"
          loading={act.isPending}
          onClick={async () => {
            if (await run({ kind: "accept" }, "Booked! The event is ready")) setConfirmAccept(false);
          }}
        >
          Yes, they accepted
        </Button>
      </Sheet>

      <Sheet open={declining} onClose={() => setDeclining(false)} title="Mark as declined">
        <div className="space-y-4">
          <TextField label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Went with another vendor" />
          <Button
            size="lg"
            variant="secondary"
            loading={act.isPending}
            onClick={async () => {
              if (await run({ kind: "decline", reason: reason || undefined }, "Marked as declined")) setDeclining(false);
            }}
          >
            Mark declined
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
