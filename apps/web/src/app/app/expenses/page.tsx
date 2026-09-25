"use client";

import { can } from "@wedding-yantra/core";
import { Lock } from "lucide-react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ExpensesView } from "@/components/money/expenses-view";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";

/** Expenses for the team: add what you spend with a bill photo, and see if it's approved. */
export default function ExpensesPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "expenses.submit") || can(workspace.role, "finance.view");
  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Expenses" subtitle="What you spend for the business, with a photo of the bill." />
      {allowed ? (
        <ExpensesView />
      ) : (
        <Card>
          <EmptyState icon={Lock} title="Expenses aren't part of your role">
            Ask the owner if you need to add what you spend.
          </EmptyState>
        </Card>
      )}
    </>
  );
}
