"use client";

import {
  can,
  computeBillTotals,
  formatDate,
  formatMoney,
  INDIAN_STATES,
  localISODate,
  PAYMENT_TERMS,
  prepareBillLines,
  rupeesInWords,
  stateFromGstin,
  type PaymentTermKey,
  type StateCode,
} from "@wedding-yantra/core";
import {
  useClients,
  useCreateBill,
  useUpdateBill,
  useWorkspace,
} from "@wedding-yantra/api-client/react";
import {
  billInput,
  updateBillInput,
  type Bill,
  type BillDraft,
  type ClientSummary,
} from "@wedding-yantra/types";
import { IndianRupee, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState, type FormEvent } from "react";
import { OptionPills } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import {
  LineItemsEditor,
  linesPayload,
  numericLines,
  toEditableLines,
  type EditableLine,
} from "@/components/bookings/line-items";
import { Button } from "@/components/ui/button";
import {
  PhoneField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { BankAccountPicker, SavedTextField } from "./invoice-extras";
import {
  planPayload,
  PlanEditor,
  toEditablePlan,
  type EditablePlan,
} from "./plan-editor";
import { deliverablesPayload, DeliverablesEditor, toEditableDeliverables, type EditableDeliverable } from "./deliverables-editor";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

const localPhone = (phone: string | null) =>
  phone?.startsWith("+91") ? phone.slice(3) : (phone ?? "");
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localISODate(d);
};

/** Which payment-terms choice matches a saved due date, so an invoice reopens as it was made. */
function termsFor(
  issueDate: string,
  dueDate: string | null,
  eventDate: string | null,
): PaymentTermKey {
  if (!dueDate) return "receipt";
  if (eventDate && dueDate === eventDate) return "event";
  const match = PAYMENT_TERMS.find(
    (t) => t.days !== null && addDays(issueDate, t.days) === dueDate,
  );
  return match?.key ?? "custom";
}

/**
 * Makes or edits an invoice, for anyone: a booked event, a client, or a new customer typed
 * here. GST is on or off per invoice, prices can include GST, the discount is in rupees
 * or percent, and money already received is recorded in the same save.
 */
export function BillEditor({
  draft,
  bill,
  onSaved,
}: {
  draft?: BillDraft;
  bill?: Bill;
  onSaved: (bill: Bill) => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateBill(workspace.id);
  const update = useUpdateBill(workspace.id, bill?.id ?? "");
  const start = bill ?? draft!;
  const details = useWorkspace(workspace.id);
  // Whether GST can be switched on: the business has a GST number (or this invoice already charges it).
  const businessGst = bill
    ? bill.chargesGst || !!details.data?.gstin
    : draft!.chargesGst;
  const homeState = bill ? stateFromGstin(bill.sellerGstin) : draft!.homeState;
  const eventDate = !bill && draft?.eventId ? draft.dueDate : null;

  // Customer
  const [clientId, setClientId] = useState<string | null>(
    bill ? bill.clientId : draft!.clientId,
  );
  const [name, setName] = useState(start.billTo.name);
  const [phone, setPhone] = useState(localPhone(start.billTo.phone));
  const [address, setAddress] = useState(start.billTo.address ?? "");
  const [gstin, setGstin] = useState(start.billTo.gstin ?? "");
  const fixedCustomer = !!bill || !!draft?.eventId;

  // Details
  const [subject, setSubject] = useState(bill?.subject ?? "");
  const [issueDate, setIssueDate] = useState(start.issueDate);
  const [terms, setTermsKey] = useState<PaymentTermKey>(() =>
    termsFor(start.issueDate, start.dueDate, eventDate),
  );
  const [dueDate, setDueDate] = useState(start.dueDate ?? "");

  // GST
  const [chargesGst, setChargesGst] = useState(
    bill ? bill.chargesGst : draft!.chargesGst,
  );
  const [pricesIncludeGst, setPricesIncludeGst] = useState(
    bill?.pricesIncludeGst ?? false,
  );
  const [placeOfSupply, setPlaceOfSupply] = useState(
    start.placeOfSupply ?? homeState ?? "",
  );

  // Lines and discount. An invoice made with prices including GST reopens showing them that way.
  const [lines, setLines] = useState<EditableLine[]>(() =>
    toEditableLines(
      bill?.pricesIncludeGst
        ? bill.items.map((i) => ({
            ...i,
            rate: Math.round(i.rate * (1 + i.taxRate / 100) * 100) / 100,
          }))
        : start.items,
    ),
  );
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">(
    bill?.discountPercent ? "percent" : "amount",
  );
  const [discount, setDiscount] = useState(
    bill?.discountPercent
      ? String(bill.discountPercent)
      : start.discount > 0
        ? String(start.discount)
        : "",
  );
  const [notes, setNotes] = useState(start.notes ?? "");
  const [termsText, setTermsText] = useState(start.terms ?? "");
  const [bankAccountId, setBankAccountId] = useState<string | null>(
    start.bankAccountId,
  );
  const [plan, setPlan] = useState<EditablePlan>(() => toEditablePlan(bill));
  const [deliverables, setDeliverables] = useState<EditableDeliverable[]>(() => toEditableDeliverables(bill ? bill.deliverables : draft!.deliverables));
  const [trackDeliverables, setTrackDeliverables] = useState(true);

  // Money received with it (new invoices only)
  const canRecord = !bill && can(workspace.role, "payments.record");
  const [paid, setPaid] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payOn, setPayOn] = useState(localISODate());
  const [payMethod, setPayMethod] = useState("upi");
  const [payRef, setPayRef] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});

  const interState =
    chargesGst && !!placeOfSupply && !!homeState && placeOfSupply !== homeState;
  const typedDiscount = Number(discount) || 0;
  const prepared = prepareBillLines(numericLines(lines), {
    chargesGst,
    pricesIncludeGst,
    discount: discountMode === "amount" ? typedDiscount : 0,
    discountPercent:
      discountMode === "percent" && typedDiscount > 0 ? typedDiscount : null,
  });
  const totals = computeBillTotals(prepared.lines, prepared.discount, {
    chargesGst,
    interState,
  });
  const received = bill ? bill.received : draft!.advance;
  const balance = Math.max(totals.total - received, 0);

  function pickTerms(key: PaymentTermKey) {
    setTermsKey(key);
    const t = PAYMENT_TERMS.find((x) => x.key === key)!;
    if (t.days !== null)
      setDueDate(t.days === 0 ? "" : addDays(issueDate, t.days));
    if (key === "event" && eventDate) setDueDate(eventDate);
  }

  function changeIssueDate(value: string) {
    setIssueDate(value);
    const t = PAYMENT_TERMS.find((x) => x.key === terms);
    if (value && t?.days) setDueDate(addDays(value, t.days));
  }

  function toggleGst(on: boolean) {
    setChargesGst(on);
    // Turning GST on: lines without a rate start at 18%, the usual rate for services.
    if (on)
      setLines((ls) =>
        ls.map((l) => (l.taxRate === 0 ? { ...l, taxRate: 18 } : l)),
      );
  }

  function pickClient(c: ClientSummary) {
    setClientId(c.id);
    setName(c.name);
    setPhone(localPhone(c.phone));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fields = {
      billTo: { name, phone, address, gstin: chargesGst ? gstin : "" },
      subject,
      chargesGst,
      pricesIncludeGst: chargesGst && pricesIncludeGst,
      discountPercent:
        discountMode === "percent" && typedDiscount > 0 ? typedDiscount : null,
      placeOfSupply:
        chargesGst && placeOfSupply ? (placeOfSupply as StateCode) : null,
      issueDate,
      dueDate: terms === "receipt" ? "" : dueDate,
      items: linesPayload(lines),
      discount: discountMode === "amount" ? discount || "0" : "0",
      notes,
      terms: termsText,
      bankAccountId,
      instalments: planPayload(plan),
      deliverables: deliverablesPayload(deliverables),
      trackDeliverables,
    };
    const payment = paid
      ? {
          amount: payAmount,
          paidOn: payOn,
          method: payMethod,
          reference: payRef,
        }
      : null;
    const check = bill
      ? validate(updateBillInput, fields)
      : validate(billInput, {
          ...fields,
          eventId: draft!.eventId,
          clientId,
          quoteId: draft!.quoteId,
          payment,
        });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const saved = bill
        ? await update.mutateAsync(fields)
        : await create.mutateAsync({
            ...fields,
            eventId: draft!.eventId,
            clientId,
            quoteId: draft!.quoteId,
            payment,
          });
      onSaved(saved);
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  const taxLine = [
    totals.tax > 0 &&
      `${interState ? "IGST" : "GST"} ${formatMoney(totals.tax, { paise: true })}`,
    totals.discount > 0 && `${formatMoney(totals.discount)} off`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form onSubmit={submit} className="space-y-6 pb-28" noValidate>
      {/* Who it's for */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-extrabold">Bill to</h2>
          {!fixedCustomer && clientId && (
            <button
              type="button"
              onClick={() => {
                setClientId(null);
                setName("");
                setPhone("");
                setAddress("");
                setGstin("");
              }}
              className="inline-flex items-center gap-1 text-sm font-bold text-ink-muted hover:text-ink"
            >
              <X className="size-4" /> Someone else
            </button>
          )}
        </div>
        {!fixedCustomer && !clientId ? (
          <CustomerSearch
            name={name}
            onName={setName}
            onPick={pickClient}
            error={errors["billTo.name"]}
          />
        ) : (
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors["billTo.name"]}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <PhoneField
            label="Mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors["billTo.phone"]}
          />
          {chargesGst && (
            <TextField
              label="Their GST number (optional)"
              value={gstin}
              onChange={(e) => {
                const v = e.target.value.toUpperCase();
                setGstin(v);
                // A GST number starts with its state code: the place of supply follows it.
                const state = stateFromGstin(v.length >= 2 ? v : null);
                if (state && v.length === 15) setPlaceOfSupply(state);
              }}
              error={errors["billTo.gstin"]}
              hint="When a company books you and claims GST."
            />
          )}
        </div>
        <TextAreaField
          label="Address"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={errors["billTo.address"]}
          hint={
            chargesGst && totals.total >= 50000 && !address
              ? "GST invoices of ₹50,000 or more need the customer's address."
              : undefined
          }
        />
        {!fixedCustomer && !clientId && name.trim().length >= 2 && (
          <p className="text-sm text-ink-muted">
            A new customer: they&apos;re added to your clients when you save.
          </p>
        )}
      </Card>

      {/* Details */}
      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg font-extrabold">Invoice details</h2>
        <TextField
          label="Subject (optional)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          error={errors.subject}
          placeholder="Bridal makeup, 12 December"
          maxLength={120}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Invoice date"
            type="date"
            value={issueDate}
            onChange={(e) => changeIssueDate(e.target.value)}
            error={errors.issueDate}
          />
          {plan.on ? (
            <p className="self-end pb-3 text-sm text-ink-muted sm:col-span-2">
              Paid in parts: each part has its own date, below.
            </p>
          ) : (
            <SelectField
              label="Payment terms"
              value={terms}
              onChange={(e) => pickTerms(e.target.value as PaymentTermKey)}
            >
              {PAYMENT_TERMS.filter((t) => t.key !== "event" || eventDate).map(
                (t) => (
                  <option key={t.key} value={t.key}>
                    {t.key === "event" && eventDate
                      ? `Before the event (${formatDate(eventDate, { year: false })})`
                      : t.label}
                  </option>
                ),
              )}
            </SelectField>
          )}
          {!plan.on && terms !== "receipt" && (
            <TextField
              label="Due by"
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setTermsKey("custom");
              }}
              error={errors.dueDate}
            />
          )}
        </div>
      </Card>

      {/* GST */}
      {businessGst ? (
        <Card className="space-y-4 p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={chargesGst}
              onChange={(e) => toggleGst(e.target.checked)}
              className="mt-0.5 size-5 accent-brand"
            />
            <span>
              <span className="block font-bold">GST invoice</span>
              <span className="block text-sm text-ink-muted">
                {chargesGst
                  ? "GST is added on each line. It prints as a tax invoice."
                  : "No GST on this one. It prints as a plain invoice."}
              </span>
            </span>
          </label>
          {chargesGst && (
            <>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={pricesIncludeGst}
                  onChange={(e) => setPricesIncludeGst(e.target.checked)}
                  className="mt-0.5 size-5 accent-brand"
                />
                <span>
                  <span className="block font-bold">My prices include GST</span>
                  <span className="block text-sm text-ink-muted">
                    A ₹50,000 package stays ₹50,000: the invoice shows ₹42,373
                    plus ₹7,627 GST.
                  </span>
                </span>
              </label>
              <SelectField
                label="Place of supply"
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                error={errors.placeOfSupply}
                hint={
                  interState
                    ? "Another state: IGST instead of CGST and SGST."
                    : "Where the event happens. Your own state: CGST and SGST."
                }
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </SelectField>
            </>
          )}
        </Card>
      ) : (
        <Notice>
          No GST on your invoices: your business has no GST number.{" "}
          <Link
            href="/app/settings/business"
            className="font-semibold text-brand-strong underline"
          >
            Add it in Business profile
          </Link>{" "}
          to make GST invoices.
        </Notice>
      )}

      <LineItemsEditor
        lines={lines}
        onChange={setLines}
        amounts={totals.lines.map((l) => l.amount)}
        errors={errors}
        allowGst={chargesGst}
        detailed
      />

      {/* Totals */}
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <TextField
            label={discountMode === "percent" ? "Discount (%)" : "Discount (₹)"}
            inputMode="decimal"
            value={discount}
            onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
            error={errors.discount ?? errors.discountPercent}
            placeholder="0"
            className="min-w-0 flex-1"
          />
          <div
            className="mb-0.5 inline-flex rounded-xl bg-cream p-1 text-sm font-bold"
            role="group"
            aria-label="Discount in"
          >
            {(["amount", "percent"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={discountMode === m}
                onClick={() => setDiscountMode(m)}
                className={cn(
                  "h-10 rounded-lg px-4",
                  discountMode === m
                    ? "bg-surface shadow-soft"
                    : "text-ink-muted",
                )}
              >
                {m === "amount" ? "₹" : "%"}
              </button>
            ))}
          </div>
        </div>
        <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
          <Row
            label="Subtotal"
            value={formatMoney(totals.subtotal, { paise: true })}
          />
          {totals.discount > 0 && (
            <Row
              label={
                discountMode === "percent"
                  ? `Discount (${typedDiscount}%)`
                  : "Discount"
              }
              value={`− ${formatMoney(totals.discount, { paise: true })}`}
            />
          )}
          {totals.byRate.map((r) =>
            interState ? (
              <Row
                key={r.rate}
                label={`IGST ${r.rate}%`}
                value={formatMoney(r.igst, { paise: true })}
              />
            ) : (
              <div key={r.rate} className="space-y-1.5">
                <Row
                  label={`CGST ${r.rate / 2}%`}
                  value={formatMoney(r.cgst, { paise: true })}
                />
                <Row
                  label={`SGST ${r.rate / 2}%`}
                  value={formatMoney(r.sgst, { paise: true })}
                />
              </div>
            ),
          )}
          {totals.roundOff !== 0 && (
            <Row
              label="Round off"
              value={formatMoney(totals.roundOff, { paise: true })}
            />
          )}
          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
            <dt className="font-bold">Total</dt>
            <dd className="font-display text-xl font-extrabold tabular">
              {formatMoney(totals.total)}
            </dd>
          </div>
          {totals.total > 0 && (
            <p className="text-xs text-ink-muted">
              {rupeesInWords(totals.total)}
            </p>
          )}
        </dl>
      </Card>

      <Card className="p-5">
        <DeliverablesEditor
          list={deliverables}
          onChange={setDeliverables}
          eventDate={eventDate}
          forEvent={!!(bill ? bill.eventId : draft!.eventId)}
          track={trackDeliverables}
          onTrack={setTrackDeliverables}
          error={errors.deliverables}
        />
      </Card>

      <Card className="p-5">
        <PlanEditor
          plan={plan}
          onChange={setPlan}
          total={totals.total}
          error={errors.instalments}
        />
      </Card>

      <Card className="space-y-5 p-5">
        <BankAccountPicker value={bankAccountId} onChange={setBankAccountId} />
        <SavedTextField
          kind="note"
          label="Note for the customer (optional)"
          value={notes}
          onChange={setNotes}
          error={errors.notes}
          placeholder="Thank you for choosing us!"
        />
        <SavedTextField
          kind="terms"
          label="Terms (optional)"
          rows={4}
          value={termsText}
          onChange={setTermsText}
          error={errors.terms}
          placeholder="50% advance to book. Balance before the event."
        />
      </Card>

      {received > 0 && (
        <Notice>
          {formatMoney(received)} already received
          {bill
            ? " on this invoice"
            : " for this booking. It shows on the invoice as paid"}
          , leaving{" "}
          <span className="font-semibold">{formatMoney(balance)}</span> to
          collect.
        </Notice>
      )}

      {/* Money received with the invoice */}
      {canRecord && (
        <Card className={cn("space-y-4 p-5", paid && "border-success/40")}>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={paid}
              onChange={(e) => {
                setPaid(e.target.checked);
                if (e.target.checked && !payAmount)
                  setPayAmount(balance > 0 ? String(balance) : "");
              }}
              className="mt-0.5 size-5 accent-brand"
            />
            <span>
              <span className="block font-bold">
                I&apos;ve received money for this
              </span>
              <span className="block text-sm text-ink-muted">
                Full, an advance or a token amount. It&apos;s recorded with the
                invoice, with a receipt number.
              </span>
            </span>
          </label>
          {paid && (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <TextField
                  label="Amount received (₹)"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) =>
                    setPayAmount(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  error={errors["payment.amount"]}
                  className="min-w-40 flex-1 [&_input]:font-display [&_input]:text-xl [&_input]:font-extrabold"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPayAmount(String(balance))}
                >
                  Full
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPayAmount(String(Math.round(balance / 2)))}
                >
                  Half
                </Button>
              </div>
              <OptionPills
                list="payment_method"
                label="How was it paid?"
                value={payMethod}
                onChange={(k) => setPayMethod(k ?? "upi")}
                error={errors["payment.method"]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Received on"
                  type="date"
                  value={payOn}
                  onChange={(e) => setPayOn(e.target.value)}
                  error={errors["payment.paidOn"]}
                />
                {payMethod !== "cash" && (
                  <TextField
                    label="Reference (optional)"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="UTR or cheque number"
                    error={errors["payment.reference"]}
                  />
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {(errors._ || errors.clientId || errors.chargesGst) && (
        <Notice tone="danger">
          {errors._ ?? errors.clientId ?? errors.chargesGst}
        </Notice>
      )}

      {/* Totals stay in view while editing */}
      <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-72">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 sm:px-2 lg:px-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink-muted">
              {lines.length} line{lines.length === 1 ? "" : "s"}
              {taxLine ? ` · ${taxLine}` : ""}
            </p>
            <p className="font-display text-2xl font-extrabold tabular">
              {formatMoney(totals.total)}
            </p>
          </div>
          <Button
            type="submit"
            loading={create.isPending || update.isPending}
            className="px-6 sm:px-8"
          >
            {!bill && <IndianRupee className="size-4" />}
            {bill
              ? "Save invoice"
              : paid
                ? "Save and record money"
                : "Make invoice"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  );
}

/** Type a name: matching clients show up to pick; otherwise it's a new customer. */
function CustomerSearch({
  name,
  onName,
  onPick,
  error,
}: {
  name: string;
  onName: (v: string) => void;
  onPick: (c: ClientSummary) => void;
  error?: string;
}) {
  const { workspace } = useCurrentWorkspace();
  const q = useDeferredValue(name.trim());
  const clients = useClients(workspace.id, q.length >= 2 ? q : "");
  const matches = q.length >= 2 ? (clients.data ?? []).slice(0, 5) : [];
  return (
    <div className="space-y-2">
      <TextField
        label="Customer name"
        value={name}
        onChange={(e) => onName(e.target.value)}
        error={error}
        placeholder="Type a name to find a client, or a new one"
        autoFocus
      />
      {matches.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-cream"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cream text-brand-strong">
                  <UserRound className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  {c.phone && (
                    <span className="block text-sm text-ink-muted tabular">
                      {c.phone}
                    </span>
                  )}
                </span>
                <span className="text-xs font-bold text-brand-strong">Use</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
