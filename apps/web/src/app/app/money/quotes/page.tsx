"use client";

import { can } from "@wedding-yantra/core";
import { Plus } from "lucide-react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { MoneyLocked, MoneyPageHeader } from "@/components/money/money-page";
import { QuotesView } from "@/components/money/quotes-view";
import { ButtonLink } from "@/components/ui/button";

export default function QuotesPage() {
  const { workspace } = useCurrentWorkspace();
  if (!can(workspace, "finance.view")) return <MoneyLocked section="quotes" />;
  return (
    <>
      <MoneyPageHeader
        section="quotes"
        subtitle="Every quote you've made, and where it stands"
        action={
          can(workspace, "quotes.manage") ? (
            <ButtonLink href="/app/quotes/new">
              <Plus className="size-4" strokeWidth={2.5} /> New quote
            </ButtonLink>
          ) : null
        }
      />
      <QuotesView />
    </>
  );
}
