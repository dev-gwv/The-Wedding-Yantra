"use client";

import { can, formatDate, formatMoney } from "@wedding-yantra/core";
import { usePayouts } from "@wedding-yantra/api-client/react";
import type { Payout } from "@wedding-yantra/types";
import { HandCoins, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, IconSquare, Pill } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { PaySheet, PayoutSheet } from "./sheets";

/**
 * One payout, with a Pay button while it's owed. `all`: across vendors and events;
 * `event`: on an event's page; `vendor`: on a vendor's page.
 */
export function PayoutRow({ p, show, onOpen, onPay }: { p: Payout; show: "all" | "event" | "vendor"; onOpen: (p: Payout) => void; onPay?: (p: Payout) => void }) {
  const when =
    p.status === "paid"
      ? `Paid ${p.paidOn ? formatDate(p.paidOn, { year: false }) : ""}`
      : p.dueDate
        ? `${p.late ? "Late: pay by" : "Pay by"} ${formatDate(p.dueDate, { year: false })}`
        : null;
  const title = show === "vendor" ? p.description : p.vendorName;
  const sub = (show === "all" ? [p.description, p.eventTitle, when] : show === "event" ? [p.description, when] : [p.eventTitle, when]).filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <button type="button" onClick={() => onOpen(p)} className="min-w-0 flex-1 text-left">
        <p className="truncate font-bold">{title}</p>
        <p className={cn("truncate text-sm text-ink-muted", p.late && "font-semibold text-danger")}>{sub}</p>
      </button>
      <p className={cn("shrink-0 font-bold tabular", p.status === "paid" && "text-ink-muted")}>{formatMoney(p.amount, { paise: p.amount % 1 !== 0 })}</p>
      {p.status === "owed" && onPay ? (
        <Button size="sm" onClick={() => onPay(p)}>
          Pay
        </Button>
      ) : (
        p.status === "paid" && <Pill tone="success">Paid</Pill>
      )}
    </li>
  );
}

/** What this event owes vendors and helpers. Paid ones are already in its expenses. */
export function EventPayouts({ eventId, cancelled }: { eventId: string; cancelled: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const sees = can(workspace.role, "finance.view");
  const manage = can(workspace.role, "expenses.approve");
  const list = usePayouts(workspace.id, { eventId }, sees);
  const [sheet, setSheet] = useState<{ p?: Payout } | null>(null);
  const [paying, setPaying] = useState<Payout | null>(null);
  if (!sees) return null;
  const items = list.data ?? [];
  if (list.isSuccess && items.length === 0 && (!manage || cancelled)) return null;
  const owed = items.filter((p) => p.status === "owed").reduce((a, p) => a + p.amount, 0);

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold">Vendors and helpers</h2>
        {owed > 0 && <span className="text-sm font-semibold text-ink-muted tabular">{formatMoney(owed)} to pay</span>}
      </div>
      {items.length > 0 ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((p) => (
              <PayoutRow key={p.id} p={p} show="event" onOpen={(x) => manage && setSheet({ p: x })} onPay={manage ? setPaying : undefined} />
            ))}
          </ul>
        </Card>
      ) : (
        list.isSuccess && (
          <Card className="flex items-start gap-4 p-5">
            <IconSquare icon={HandCoins} />
            <p className="text-sm text-ink-muted">
              Note what you owe florists, helpers or a second shooter for this event. Paying them adds it to the event&apos;s expenses.{" "}
              <Link href="/app/vendors" className="font-semibold text-brand-strong">
                All vendors
              </Link>
            </p>
          </Card>
        )
      )}
      {manage && !cancelled && (
        <Button variant="secondary" className="mt-3" onClick={() => setSheet({})}>
          <Plus className="size-4" /> Add what you owe
        </Button>
      )}
      <PayoutSheet open={sheet !== null} onClose={() => setSheet(null)} payout={sheet?.p} eventId={eventId} />
      <PaySheet payout={paying} onClose={() => setPaying(null)} />
    </section>
  );
}
