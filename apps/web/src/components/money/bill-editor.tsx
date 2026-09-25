"use client";

import { computeBillTotals, formatMoney, INDIAN_STATES, stateFromGstin, type StateCode } from "@wedding-yantra/core";
import { useCreateBill, useUpdateBill } from "@wedding-yantra/api-client/react";
import { billInput, updateBillInput, type Bill, type BillDraft } from "@wedding-yantra/types";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { LineItemsEditor, linesPayload, numericLines, toEditableLines, type EditableLine } from "@/components/bookings/line-items";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

const localPhone = (phone: string | null) => (phone?.startsWith("+91") ? phone.slice(3) : (phone ?? ""));

/**
 * Makes or edits a bill. A new bill starts from the server's draft: the accepted quote's
 * services, the client, and the event day as the due date.
 */
export function BillEditor({ draft, bill, onSaved }: { draft?: BillDraft; bill?: Bill; onSaved: (bill: Bill) => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateBill(workspace.id);
  const update = useUpdateBill(workspace.id, bill?.id ?? "");
  const start = bill ?? draft!;
  const chargesGst = bill ? bill.chargesGst : draft!.chargesGst;
  const homeState = bill ? stateFromGstin(bill.sellerGstin) : draft!.homeState;

  const [name, setName] = useState(start.billTo.name);
  const [phone, setPhone] = useState(localPhone(start.billTo.phone));
  const [address, setAddress] = useState(start.billTo.address ?? "");
  const [gstin, setGstin] = useState(start.billTo.gstin ?? "");
  const [placeOfSupply, setPlaceOfSupply] = useState(start.placeOfSupply ?? homeState ?? "");
  const [issueDate, setIssueDate] = useState(start.issueDate);
  const [dueDate, setDueDate] = useState(start.dueDate ?? "");
  const [lines, setLines] = useState<EditableLine[]>(() => toEditableLines(start.items));
  const [discount, setDiscount] = useState(start.discount > 0 ? String(start.discount) : "");
  const [notes, setNotes] = useState(start.notes ?? "");
  const [terms, setTerms] = useState(start.terms ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const interState = chargesGst && !!placeOfSupply && !!homeState && placeOfSupply !== homeState;
  const totals = computeBillTotals(numericLines(lines), Number(discount) || 0, { chargesGst, interState });
  const received = bill ? bill.received : draft!.advance;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fields = {
      billTo: { name, phone, address, gstin },
      placeOfSupply: chargesGst && placeOfSupply ? (placeOfSupply as StateCode) : null,
      issueDate,
      dueDate,
      items: linesPayload(lines),
      discount: discount || "0",
      notes,
      terms,
    };
    const check = bill
      ? validate(updateBillInput, fields)
      : validate(billInput, { ...fields, eventId: draft!.eventId, clientId: draft!.clientId, quoteId: draft!.quoteId });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const saved = bill
        ? await update.mutateAsync(fields)
        : await create.mutateAsync({ ...fields, eventId: draft!.eventId, clientId: draft!.clientId, quoteId: draft!.quoteId });
      onSaved(saved);
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  const taxLine = [
    totals.tax > 0 && (interState ? `IGST ${formatMoney(totals.tax, { paise: true })}` : `GST ${formatMoney(totals.tax, { paise: true })}`),
    totals.discount > 0 && `${formatMoney(totals.discount)} off`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form onSubmit={submit} className="space-y-6 pb-28" noValidate>
      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg font-extrabold">Bill to</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors["billTo.name"]} />
          <PhoneField label="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors["billTo.phone"]} />
        </div>
        <TextAreaField
          label="Address"
          rows={2}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={errors["billTo.address"]}
          hint={chargesGst && totals.total >= 50000 && !address ? "GST bills of ₹50,000 or more need the client's address." : undefined}
        />
        {chargesGst && (
          <TextField
            label="Client's GST number (optional)"
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            error={errors["billTo.gstin"]}
            hint="Only when a company books you and wants to claim GST."
          />
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Bill date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} error={errors.issueDate} />
        <TextField
          label="Due by"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          error={errors.dueDate}
          hint="Leave empty if it's due now."
        />
      </div>

      {chargesGst ? (
        <SelectField
          label="Place of supply"
          value={placeOfSupply}
          onChange={(e) => setPlaceOfSupply(e.target.value)}
          error={errors.placeOfSupply}
          hint={interState ? "Another state: IGST is charged instead of CGST and SGST." : "Where the event happens. Your own state: CGST and SGST."}
        >
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.code})
            </option>
          ))}
        </SelectField>
      ) : (
        <Notice>
          No GST is added because your business has no GST number.{" "}
          <Link href="/app/settings/business" className="font-semibold text-brand-strong underline">
            Add it in Business profile
          </Link>{" "}
          to make GST bills.
        </Notice>
      )}

      <LineItemsEditor lines={lines} onChange={setLines} amounts={totals.lines.map((l) => l.amount)} errors={errors} allowGst={chargesGst} />

      <TextField
        label="Discount (₹)"
        inputMode="decimal"
        value={discount}
        onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))}
        error={errors.discount}
        placeholder="0"
      />
      <TextAreaField label="Note for the client" value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} />
      <TextAreaField
        label="Terms and payment details"
        rows={4}
        value={terms}
        onChange={(e) => setTerms(e.target.value)}
        error={errors.terms}
        hint="Bank details, payment terms. Set the usual ones in Business profile."
      />

      {received > 0 && (
        <Notice>
          {formatMoney(received)} already received{bill ? " on this bill" : " for this booking. It shows on the bill as paid"}, leaving{" "}
          <span className="font-semibold">{formatMoney(Math.max(totals.total - received, 0))}</span> to collect.
        </Notice>
      )}
      {(errors._ || errors.clientId) && <Notice tone="danger">{errors._ ?? errors.clientId}</Notice>}

      {/* Totals stay in view while editing */}
      <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-72">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 sm:px-2 lg:px-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-ink-muted">{taxLine || "Total"}</p>
            <p className="font-display text-2xl font-extrabold tabular">{formatMoney(totals.total)}</p>
          </div>
          <Button type="submit" loading={create.isPending || update.isPending} className="px-8">
            {bill ? "Save bill" : "Make bill"}
          </Button>
        </div>
      </div>
    </form>
  );
}
