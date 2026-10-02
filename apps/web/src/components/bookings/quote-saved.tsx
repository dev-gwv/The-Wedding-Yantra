"use client";

import { formatMoney, whatsappLink } from "@wedding-yantra/core";
import { useQuoteAction } from "@wedding-yantra/api-client/react";
import type { Quote } from "@wedding-yantra/types";
import { CircleCheck, FileText, MessageCircle } from "lucide-react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

/** Right after a quote is made: send it on WhatsApp, or open it. */
export function QuoteSaved({ quote }: { quote: Quote }) {
  const { workspace } = useCurrentWorkspace();
  const act = useQuoteAction(workspace.id, quote.id);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/q/${quote.shareToken}`;
  const first = quote.customerName.split(" ")[0];
  // Same words as the Send on WhatsApp button on the quote's page.
  const message = `Hi ${first}, here is your quote ${quote.number} from ${workspace.name}. You can see the details and accept it here: ${url}`;

  return (
    <Card className="p-6 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
        <CircleCheck className="size-7" />
      </span>
      <h2 className="mt-4 font-display text-2xl font-extrabold">Quote {quote.number} is ready</h2>
      <p className="mt-1 text-ink-muted">
        For {quote.customerName} · <span className="tabular">{formatMoney(quote.total, { paise: quote.total % 1 !== 0 })}</span>
      </p>
      <div className="mx-auto mt-6 grid max-w-sm gap-2">
        <a
          href={whatsappLink(message, quote.customerPhone ?? undefined)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ size: "lg" })}
          onClick={() => quote.status === "draft" && act.mutate({ kind: "send" })}
        >
          <MessageCircle className="size-5" /> Send on WhatsApp
        </a>
        <ButtonLink href={`/app/quotes/${quote.id}`} variant="secondary" size="lg">
          <FileText className="size-5" /> Open quote
        </ButtonLink>
      </div>
      {!quote.customerPhone && <p className="mt-3 text-sm text-ink-muted">No number saved, so WhatsApp will ask who to send it to.</p>}
    </Card>
  );
}
