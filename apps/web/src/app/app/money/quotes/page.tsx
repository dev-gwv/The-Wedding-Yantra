"use client";

import { can } from "@wedding-yantra/core";
import { Plus } from "lucide-react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { MoneyLocked, MoneyPageHeader } from "@/components/money/money-page";
import { QuotesView } from "@/components/money/quotes-view";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";

export default function QuotesPage() {
  const { workspace } = useCurrentWorkspace();
  if (!can(workspace, "quotes.view")) return <MoneyLocked section="quotes" />;
  const subtitle = "Every quote you've made, and where it stands";
  const action = can(workspace, "quotes.manage") ? (
    <ButtonLink href="/app/quotes/new">
      <Plus className="size-4" strokeWidth={2.5} /> New quote
    </ButtonLink>
  ) : null;
  return (
    <>
      {can(workspace, "finance.view") ? (
        <MoneyPageHeader section="quotes" subtitle={subtitle} action={action} />
      ) : (
        // Without the money, Quotes is a page of its own.
        <PageHeader title="Quotes" subtitle={subtitle} action={action} />
      )}
      <QuotesView />
    </>
  );
}
