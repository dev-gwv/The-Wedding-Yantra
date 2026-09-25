"use client";

import {
  can,
  formatDate,
  formatMoney,
  localISODate,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  receiptMessage,
  whatsappLink,
  type PaymentMethod,
} from "@wedding-yantra/core";
import { useDeletePayment, useRecordPayment, useUpdatePayment } from "@wedding-yantra/api-client/react";
import { paymentInput, updatePaymentInput, type Payment } from "@wedding-yantra/types";
import { Banknote, CircleCheck, CreditCard, FileText, Landmark, MessageCircle, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  upi: Smartphone,
  cash: Banknote,
  bank: Landmark,
  cheque: FileText,
  card: CreditCard,
  other: Wallet,
};

const REFERENCE_LABELS: Partial<Record<PaymentMethod, string>> = {
  upi: "UPI reference (optional)",
  bank: "Transfer reference (optional)",
  cheque: "Cheque number (optional)",
  card: "Card slip number (optional)",
};

interface Who {
  clientName: string;
  clientPhone: string | null;
  /** Bill link for the receipt message */
  billLink: string | null;
}

/**
 * Record money received, or change a payment already recorded. After saving, one tap
 * sends the client a receipt on WhatsApp.
 */
export function PaymentSheet({
  open,
  onClose,
  target,
  payment,
  due,
  who,
}: {
  open: boolean;
  onClose: () => void;
  /** What a new payment is for */
  target?: { billId?: string; eventId?: string; clientId?: string };
  /** Editing this payment */
  payment?: Payment;
  /** Still to collect before this payment */
  due: number;
  who: Who;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={payment ? `Payment ${payment.number}` : "Money received"}>
      {/* Remount on open so the form starts fresh each time */}
      {open && <PaymentForm target={target} payment={payment} due={due} who={who} onDone={onClose} />}
    </Sheet>
  );
}

function PaymentForm({
  target,
  payment,
  due,
  who,
  onDone,
}: {
  target?: { billId?: string; eventId?: string; clientId?: string };
  payment?: Payment;
  due: number;
  who: Who;
  onDone: () => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const business = workspace.name;
  const record = useRecordPayment(workspace.id);
  const update = useUpdatePayment(workspace.id);
  const remove = useDeletePayment(workspace.id);
  const toast = useToast();
  const canEdit = can(workspace.role, "payments.record");
  const [amount, setAmount] = useState(payment ? String(payment.amount) : due > 0 ? String(due) : "");
  const [paidOn, setPaidOn] = useState(() => payment?.paidOn ?? localISODate());
  const [method, setMethod] = useState<PaymentMethod>(payment?.method ?? "upi");
  const [reference, setReference] = useState(payment?.reference ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The balance is worked out when saving: the list refreshes right after, and `due` changes with it.
  const [saved, setSaved] = useState<{ payment: Payment; balance: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const receipt = (p: Payment, balance: number) =>
    whatsappLink(
      receiptMessage({
        clientName: who.clientName,
        business,
        amount: p.amount,
        method: p.method,
        paidOn: p.paidOn,
        due: balance,
        link: who.billLink,
      }),
      who.clientPhone ?? undefined,
    );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fields = { amount, paidOn, method, reference: REFERENCE_LABELS[method] ? reference : "" };
    const check = payment ? validate(updatePaymentInput, fields) : validate(paymentInput, { ...fields, ...target });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (payment) {
        await update.mutateAsync({ id: payment.id, ...fields });
        toast("Payment updated");
        onDone();
      } else {
        const made = await record.mutateAsync({ ...fields, ...target });
        setSaved({ payment: made, balance: Math.max(due - made.amount, 0) });
      }
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  async function deleteIt() {
    if (!payment) return;
    try {
      await remove.mutateAsync(payment.id);
      toast("Payment removed");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  if (saved) {
    const { payment: made, balance } = saved;
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
          <CircleCheck className="size-7" />
        </span>
        <div>
          <p className="font-display text-2xl font-extrabold tabular">{formatMoney(made.amount)} received</p>
          <p className="mt-1 text-ink-muted">
            Receipt {made.number} · {balance > 0 ? `${formatMoney(balance)} still due` : "Nothing more due"}
          </p>
        </div>
        <a href={receipt(made, balance)} target="_blank" rel="noopener noreferrer" className={buttonClass({ size: "lg" })}>
          <MessageCircle className="size-4" /> Send receipt on WhatsApp
        </a>
        <Button variant="ghost" size="lg" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  const Ref = REFERENCE_LABELS[method];
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField
        label="Amount (₹)"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
        error={errors.amount}
        disabled={!canEdit}
        hint={!payment && due > 0 ? `${formatMoney(due)} is due` : undefined}
        className="[&_input]:font-display [&_input]:text-2xl [&_input]:font-extrabold"
      />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">How was it paid?</legend>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => {
            const Icon = METHOD_ICONS[m];
            const selected = method === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={selected}
                disabled={!canEdit}
                onClick={() => setMethod(m)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition",
                  selected ? "bg-gradient-primary text-on-brand shadow-soft" : "border border-line bg-surface text-ink hover:bg-cream",
                )}
              >
                <Icon className="size-4" /> {PAYMENT_METHOD_LABELS[m]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} error={errors.paidOn} disabled={!canEdit} />
        {Ref && <TextField label={Ref} value={reference} onChange={(e) => setReference(e.target.value)} error={errors.reference} disabled={!canEdit} />}
      </div>
      {(errors._ || errors.billId) && <Notice tone="danger">{errors._ ?? errors.billId}</Notice>}
      {payment && (
        <p className="text-sm text-ink-muted">
          Recorded {payment.recordedBy?.name ? `by ${payment.recordedBy.name} ` : ""}on {formatDate(payment.createdAt)}
          {payment.billNumber ? ` · on bill ${payment.billNumber}` : " · not on a bill yet"}
        </p>
      )}
      {canEdit && (
        <Button type="submit" size="lg" loading={record.isPending || update.isPending}>
          {payment ? "Save changes" : `Save ${Number(amount) > 0 ? formatMoney(Number(amount)) : ""} received`}
        </Button>
      )}
      {payment && (
        <a
          href={receipt(payment, due)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: "secondary", size: "lg" })}
        >
          <MessageCircle className="size-4" /> Send receipt on WhatsApp
        </a>
      )}
      {payment && canEdit && !confirmDelete && (
        <Button variant="ghost" size="lg" onClick={() => setConfirmDelete(true)} className="text-danger">
          Remove this payment
        </Button>
      )}
      {confirmDelete && (
        <div className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          <p className="font-semibold">Remove {formatMoney(payment?.amount ?? 0)}? It goes back to money to collect.</p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" size="sm" onClick={deleteIt} loading={remove.isPending}>
              Yes, remove it
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

/** One payment in a list: how much, how and when. */
export function PaymentRow({ payment, onClick }: { payment: Payment; onClick?: () => void }) {
  const Icon = METHOD_ICONS[payment.method];
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-cream">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold tabular">
          {formatMoney(payment.amount, { paise: payment.amount % 1 !== 0 })} · {PAYMENT_METHOD_LABELS[payment.method]}
        </span>
        <span className="block truncate text-sm text-ink-muted">
          {[formatDate(payment.paidOn), payment.number, payment.reference].filter(Boolean).join(" · ")}
        </span>
      </span>
    </button>
  );
}
