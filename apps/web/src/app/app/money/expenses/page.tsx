"use client";

import { can } from "@wedding-yantra/core";
import { Plus } from "lucide-react";
import { Suspense, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ExpensesView } from "@/components/money/expenses-view";
import { MoneyLocked, MoneyPageHeader, useMoneyRange } from "@/components/money/money-page";
import { Button } from "@/components/ui/button";
import { Splash } from "@/components/ui/spinner";

function ExpensesScreen() {
  const { workspace } = useCurrentWorkspace();
  const [range, setRange] = useMoneyRange();
  const [adding, setAdding] = useState(false);
  if (!can(workspace.role, "finance.view")) return <MoneyLocked section="expenses" />;
  return (
    <>
      <MoneyPageHeader
        section="expenses"
        dates={{ range, onChange: setRange }}
        action={
          can(workspace.role, "expenses.submit") ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" strokeWidth={2.5} /> Add expense
            </Button>
          ) : null
        }
      />
      <ExpensesView adding={adding} onAddingChange={setAdding} range={range} />
    </>
  );
}

export default function MoneyExpensesPage() {
  return (
    <Suspense fallback={<Splash />}>
      <ExpensesScreen />
    </Suspense>
  );
}
