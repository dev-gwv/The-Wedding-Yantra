"use client";

import { formatMoney } from "@wedding-yantra/core";
import { usePublicQuote, usePublicQuoteAnswer } from "@wedding-yantra/api-client/react";
import { CircleCheck, FileX, Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogoMark } from "@/components/app/logo";
import { QuoteDocument } from "@/components/bookings/quote-document";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Splash } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";

/** The link a business sends its client on WhatsApp. */
export default function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const data = usePublicQuote(token);
  const answer = usePublicQuoteAnswer(token);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (data.isPending) return <Splash />;
  if (data.isError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-hero px-4">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-soft">
          <EmptyState icon={FileX} title="This quote isn't available" className="py-6">
            The link may be old. Please ask the business to send it again.
          </EmptyState>
        </div>
      </main>
    );
  }

  const { business, quote } = data.data;
  const open = (quote.status === "draft" || quote.status === "sent") && !quote.expired;

  async function accept(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError("Type your name to accept");
    setError(null);
    try {
      await answer.mutateAsync({ accept: true, name: name.trim() });
      setAccepting(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function decline() {
    try {
      await answer.mutateAsync({ accept: false, reason: reason.trim() || undefined });
      setDeclining(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="min-h-dvh bg-cream print:bg-surface">
      <main className="mx-auto w-full max-w-3xl px-4 pb-36 pt-6 sm:px-6 sm:pt-10 print:p-0">
        {quote.status === "accepted" && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 font-semibold text-success print:hidden">
            <CircleCheck className="size-5 shrink-0" /> Thank you! {business.name} has your confirmation.
          </div>
        )}
        {quote.status === "declined" && (
          <div className="mb-5 print:hidden">
            <Notice>You declined this quote. {business.name} has been told.</Notice>
          </div>
        )}
        {quote.expired && quote.status === "sent" && (
          <div className="mb-5 print:hidden">
            <Notice tone="warning">This quote has expired. Please ask {business.name} for an updated one.</Notice>
          </div>
        )}

        <QuoteDocument business={business} quote={quote} />

        <div className="mt-5 flex items-center justify-between gap-3 print:hidden">
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <LogoMark className="size-5" /> Sent with Wedding Yantra
          </p>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Save as PDF
          </Button>
        </div>
      </main>

      {open && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-muted">Total</p>
              <p className="font-display text-xl font-extrabold tabular">{formatMoney(quote.total, { paise: quote.total % 1 !== 0 })}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDeclining(true)}>
                Decline
              </Button>
              <Button onClick={() => setAccepting(true)} className="px-6">
                Accept quote
              </Button>
            </div>
          </div>
        </div>
      )}

      <Sheet open={accepting} onClose={() => setAccepting(false)} title="Accept this quote" description={`${business.name} will confirm your booking.`}>
        <form onSubmit={accept} className="space-y-4" noValidate>
          <TextField label="Your full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus error={error ?? undefined} />
          <Button type="submit" size="lg" loading={answer.isPending}>
            Accept {formatMoney(quote.total, { paise: quote.total % 1 !== 0 })}
          </Button>
        </form>
      </Sheet>
      <Sheet open={declining} onClose={() => setDeclining(false)} title="Decline this quote">
        <div className="space-y-4">
          <TextField label="Anything to tell them? (optional)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Our dates changed" />
          {error && <Notice tone="danger">{error}</Notice>}
          <Button size="lg" variant="secondary" loading={answer.isPending} onClick={decline}>
            Decline quote
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
