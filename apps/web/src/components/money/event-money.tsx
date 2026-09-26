"use client";

import { can, formatMoney } from "@wedding-yantra/core";
import { useEventMoney } from "@wedding-yantra/api-client/react";
import type { Payment, WeddingEvent } from "@wedding-yantra/types";
import { FilePlus2, IndianRupee } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, Notice, ProgressBar } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { billUrl } from "@/lib/links";
import { PaymentRow, PaymentSheet } from "./payment-sheet";
import { BillRow } from "./rows";

/** The money side of an event: what's billed, received and still due. Money roles only. */
export function EventMoneyCard({ event }: { event: WeddingEvent }) {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "finance.view");
  const money = useEventMoney(workspace.id, event.id, allowed);
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<Payment | null>(null);
  if (!allowed) return null;
  if (money.isPending)
    return (
      <div className="flex justify-center py-6 text-brand">
        <Spinner />
      </div>
    );
  if (money.isError) return <Notice tone="danger">{errorMessage(money.error)}</Notice>;

  const m = money.data;
  const openBill = m.bills.find((b) => b.status === "issued" && b.due > 0) ?? m.bills.find((b) => b.status === "issued");
  const who = {
    clientName: event.clientName ?? event.title,
    clientPhone: event.clientPhone,
    billLink: openBill ? billUrl(openBill.shareToken) : null,
  };
  const billed = m.bills.some((b) => b.status === "issued");
  const share = m.expected > 0 ? Math.min(100, Math.round((m.received / m.expected) * 100)) : 0;

  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-extrabold">Money</h2>
      <Card className="p-5">
        {m.expected > 0 ? (
          <>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div>
                <dt className="text-xs font-semibold text-ink-muted">{billed ? "Billed" : "Booking"}</dt>
                <dd className="mt-1 font-display text-lg font-extrabold tabular">{formatMoney(m.expected)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink-muted">Received</dt>
                <dd className="mt-1 font-display text-lg font-extrabold text-success tabular">{formatMoney(m.received)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-ink-muted">Due</dt>
                <dd className={`mt-1 font-display text-lg font-extrabold tabular ${m.due > 0 ? "text-danger" : ""}`}>{formatMoney(m.due)}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <ProgressBar value={share} label={`${share}% received`} />
            </div>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-4 text-sm">
              <span className="text-ink-muted">
                Spent <span className="font-bold text-ink tabular">{formatMoney(m.spent)}</span>
                {m.pendingSpend > 0 && <span className="text-warning"> (+{formatMoney(m.pendingSpend)} waiting)</span>}
              </span>
              <span className="text-ink-muted">
                Profit{" "}
                <span className={`font-display text-lg font-extrabold tabular ${m.profit < 0 ? "text-danger" : "text-success"}`}>
                  {formatMoney(m.profit)}
                </span>
                {m.revenue > 0 && <span className="tabular"> · {Math.round((m.profit / m.revenue) * 100)}%</span>}
              </span>
            </div>
          </>
        ) : (
          <p className="text-ink-muted">No booking value yet. Make an invoice, or add the value to the event.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {can(workspace.role, "payments.record") && (
            <Button variant="secondary" onClick={() => setRecording(true)}>
              <IndianRupee className="size-4" /> Money received
            </Button>
          )}
          {can(workspace.role, "bills.manage") && (
            <ButtonLink href={`/app/bills/new?eventId=${event.id}`} variant="secondary">
              <FilePlus2 className="size-4" /> {billed ? "Another invoice" : "Make invoice"}
            </ButtonLink>
          )}
        </div>
      </Card>

      {m.bills.length > 0 && (
        <Card className="mt-3 divide-y divide-line overflow-hidden">
          {m.bills.map((b) => (
            <BillRow key={b.id} bill={b} showClient={false} />
          ))}
        </Card>
      )}

      {m.payments.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-bold text-ink-muted">Received</h3>
          <Card className="divide-y divide-line overflow-hidden">
            {m.payments.map((p) => (
              <PaymentRow key={p.id} payment={p} onClick={() => setEditing(p)} />
            ))}
          </Card>
        </>
      )}

      <PaymentSheet open={recording} onClose={() => setRecording(false)} target={{ eventId: event.id }} due={m.due} who={who} />
      <PaymentSheet open={!!editing} onClose={() => setEditing(null)} payment={editing ?? undefined} due={m.due} who={who} />
    </section>
  );
}
