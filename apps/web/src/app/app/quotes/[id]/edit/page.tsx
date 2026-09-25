"use client";

import { useQuote } from "@wedding-yantra/api-client/react";
import { useParams, useRouter } from "next/navigation";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { QuoteEditor } from "@/components/bookings/quote-editor";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

export default function EditQuotePage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const quote = useQuote(workspace.id, id);
  const router = useRouter();
  const toast = useToast();

  if (quote.isPending) return <Splash />;
  if (quote.isError) return <Notice tone="danger">{errorMessage(quote.error)}</Notice>;
  const q = quote.data;
  if (q.status === "accepted" || q.status === "declined") {
    return <Notice>This quote was {q.status}. Make a new quote to change the price.</Notice>;
  }
  return (
    <>
      <BackLink href={`/app/quotes/${q.id}`} label={q.number} />
      <PageHeader title={`Edit ${q.number}`} subtitle={`For ${q.customerName}`} />
      <QuoteEditor
        key={q.id}
        quote={q}
        onSaved={() => {
          toast("Quote saved");
          router.replace(`/app/quotes/${q.id}`);
        }}
      />
    </>
  );
}
