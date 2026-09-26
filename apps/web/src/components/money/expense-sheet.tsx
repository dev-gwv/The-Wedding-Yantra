"use client";

import { can, formatDate, formatMoney, localISODate } from "@wedding-yantra/core";
import {
  useApi,
  useCreateExpense,
  useDeleteExpense,
  useEvents,
  useReimburseExpense,
  useReviewExpense,
  useTeam,
  useUpdateExpense,
  useUploadFile,
  useVendors,
} from "@wedding-yantra/api-client/react";
import { EXPENSE_STATUS_LABELS, expenseInput, updateExpenseInput, type Expense, type UploadedFile } from "@wedding-yantra/types";
import { Camera, ChevronDown, FileText, HandCoins, X } from "lucide-react";
import { OptionPills, OptionIcon } from "@/components/app/option-picker";
import { useRef, useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { prepareUpload } from "@/lib/images";

/** GST rates a purchase bill usually carries, after GST 2.0 */
const PURCHASE_GST_RATES = [0, 5, 18, 40];
const gstInside = (amount: number, rate: number) => Math.round(((amount * rate) / (100 + rate)) * 100) / 100;

/** Add money spent, or open one to change, approve or reject it. */
export function ExpenseSheet({
  open,
  onClose,
  expense,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  expense?: Expense;
  /** Opened from an event: the expense is for it */
  eventId?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={expense ? "Expense" : "Money spent"}>
      {open && <ExpenseForm expense={expense} eventId={eventId} onDone={onClose} />}
    </Sheet>
  );
}

function ExpenseForm({ expense, eventId, onDone }: { expense?: Expense; eventId?: string; onDone: () => void }) {
  const api = useApi();
  const { workspace, me } = useCurrentWorkspace();
  const approver = can(workspace.role, "expenses.approve");
  const mine = !expense || expense.submittedBy?.id === me.user.id;
  // Approvers change anything; others their own until approved. The accountant only looks.
  const editable = approver || (mine && can(workspace.role, "expenses.submit") && expense?.status !== "approved");
  const create = useCreateExpense(workspace.id);
  const update = useUpdateExpense(workspace.id);
  const review = useReviewExpense(workspace.id);
  const remove = useDeleteExpense(workspace.id);
  const upload = useUploadFile(workspace.id);
  const reimburse = useReimburseExpense(workspace.id);
  const events = useEvents(workspace.id, {}, !eventId && !expense?.eventId && can(workspace.role, "events.view"));
  // Owners and managers pick a vendor from their list and note who paid from their pocket.
  const vendors = useVendors(workspace.id, approver);
  const team = useTeam(approver ? workspace.id : null);
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [category, setCategory] = useState<string>(expense?.category ?? "");
  const [spentOn, setSpentOn] = useState(() => expense?.spentOn ?? localISODate());
  const [paidTo, setPaidTo] = useState(expense?.paidTo ?? "");
  const [forEvent, setForEvent] = useState(expense?.eventId ?? eventId ?? "");
  const [note, setNote] = useState(expense?.note ?? "");
  const [receipt, setReceipt] = useState<UploadedFile | null>(expense?.receipt ?? null);
  const [method, setMethod] = useState<string | null>(expense?.method ?? null);
  const [paidBy, setPaidBy] = useState(expense?.paidBy?.id ?? "");
  const [vendorId, setVendorId] = useState(expense?.vendorId ?? "");
  const [gstOpen, setGstOpen] = useState(!!expense && (expense.gstAmount > 0 || !!expense.vendorInvoiceNo));
  const [gstRate, setGstRate] = useState<number | null>(expense?.gstRate ?? null);
  // Empty means "work it out from the rate"; typed means the bill says otherwise.
  const [gstTyped, setGstTyped] = useState(expense && expense.gstRate === null && expense.gstAmount > 0 ? String(expense.gstAmount) : "");
  const [vendorInvoiceNo, setVendorInvoiceNo] = useState(expense?.vendorInvoiceNo ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const prepared = await prepareUpload(file);
      setReceipt(await upload.mutateAsync(prepared));
      setErrors((e) => ({ ...e, receiptFileId: "" }));
    } catch (err) {
      setErrors((e) => ({ ...e, receiptFileId: errorMessage(err) }));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fields = {
      amount,
      category,
      spentOn,
      paidTo,
      note,
      eventId: forEvent || null,
      receiptFileId: receipt?.id ?? null,
      method,
      vendorId: vendorId || null,
      gstRate,
      vendorInvoiceNo,
      ...(gstTyped ? { gstAmount: gstTyped } : !gstRate ? { gstAmount: 0 } : {}),
      // Sent only when changed: the team may keep someone else's name that the owner set.
      ...(paidBy !== (expense?.paidBy?.id ?? "") ? { paidBy: paidBy || null } : {}),
    };
    const check = expense ? validate(updateExpenseInput, fields) : validate(expenseInput, fields);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (expense) {
        await update.mutateAsync({ ...(fields as Omit<Parameters<typeof update.mutateAsync>[0], "id">), id: expense.id });
        toast(expense.status === "rejected" && !approver ? "Sent for approval again" : "Expense saved");
      } else {
        await create.mutateAsync(fields as Parameters<typeof create.mutateAsync>[0]);
        toast(approver ? "Expense added" : "Sent to the owner for approval");
      }
      onDone();
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  async function decide(approve: boolean) {
    if (!expense) return;
    try {
      await review.mutateAsync({ id: expense.id, approve, reason: approve ? undefined : reason || undefined });
      toast(approve ? "Approved" : "Sent back");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function payBack(reimbursed: boolean) {
    if (!expense) return;
    try {
      await reimburse.mutateAsync({ id: expense.id, reimbursed });
      toast(reimbursed ? `Marked as paid back to ${expense.paidBy?.name ?? "them"}` : "Marked as not paid back");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  function pickVendor(id: string) {
    setVendorId(id);
    const v = vendors.data?.find((x) => x.id === id);
    if (v && (!paidTo || vendors.data?.some((x) => x.name === paidTo))) setPaidTo(v.name);
  }

  async function deleteIt() {
    if (!expense) return;
    try {
      await remove.mutateAsync(expense.id);
      toast("Expense removed");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const photoUrl = receipt ? api.fileUrl(receipt.path) : null;
  const amountNum = Number(amount) || 0;
  const gstShown = gstTyped ? Number(gstTyped) || 0 : gstRate ? gstInside(amountNum, gstRate) : 0;
  const others = (team.data?.members ?? []).filter((m) => m.userId !== me.user.id);

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {expense && expense.status !== "approved" && (
        <Notice tone={expense.status === "rejected" ? "danger" : "warning"}>
          {EXPENSE_STATUS_LABELS[expense.status]}
          {expense.status === "rejected" && expense.rejectReason ? `: ${expense.rejectReason}` : ""}
          {expense.submittedBy?.name ? ` · added by ${expense.submittedBy.name}` : ""}
        </Notice>
      )}
      {expense && approver && expense.status === "pending" && !rejecting && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => decide(true)} loading={review.isPending} className="text-success">
            Approve {formatMoney(expense.amount)}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setRejecting(true)}>
            Send back
          </Button>
        </div>
      )}
      {expense?.paidBy && expense.status === "approved" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream p-4">
          <HandCoins className="size-5 shrink-0 text-brand-strong" />
          <p className="min-w-0 flex-1 text-sm">
            {expense.reimbursedAt ? (
              <>
                Paid back to <b>{expense.paidBy.name ?? "them"}</b> on {formatDate(expense.reimbursedAt.slice(0, 10))}
              </>
            ) : (
              <>
                <b>{expense.paidBy.name ?? "They"}</b> paid this from their pocket. <b>{formatMoney(expense.amount)}</b> to pay back.
              </>
            )}
          </p>
          {approver && (
            <Button variant={expense.reimbursedAt ? "ghost" : "secondary"} size="sm" onClick={() => payBack(!expense.reimbursedAt)} loading={reimburse.isPending}>
              {expense.reimbursedAt ? "Undo" : "Mark paid back"}
            </Button>
          )}
        </div>
      )}
      {rejecting && (
        <div className="space-y-3 rounded-2xl bg-cream p-4">
          <TextField label="Why? (they'll see this)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Add the bill photo" />
          <Button variant="secondary" onClick={() => decide(false)} loading={review.isPending}>
            Send back
          </Button>
        </div>
      )}
      <fieldset disabled={!editable} className="space-y-4">
        <TextField
          label="Amount (₹)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          error={errors.amount}
          className="[&_input]:font-display [&_input]:text-2xl [&_input]:font-extrabold"
        />
        <OptionPills list="expense_category" label="What for?" value={category || null} onChange={(k) => setCategory(k ?? "")} error={errors.category} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Date" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} error={errors.spentOn} />
          <TextField label="Paid to (optional)" value={paidTo} onChange={(e) => setPaidTo(e.target.value)} error={errors.paidTo} placeholder="Flower market" />
        </div>
        {approver && (vendors.data?.length ?? 0) > 0 && (
          <SelectField label="From your vendors (optional)" value={vendorId} onChange={(e) => pickVendor(e.target.value)} error={errors.vendorId}>
            <option value="">Not in my vendor list</option>
            {vendors.data!.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.service ? ` · ${v.service}` : ""}
              </option>
            ))}
          </SelectField>
        )}
        <OptionPills list="payment_method" label="Paid with (optional)" value={method} onChange={setMethod} error={errors.method} allowNone />
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Who paid?</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ["", "The business"],
              [me.user.id, approver ? "Me, from my pocket" : "I paid from my pocket"],
              ...others.map((m) => [m.userId, m.name ?? m.phone] as [string, string]),
              // Someone who has since left still shows on their old expense.
              ...(expense?.paidBy && expense.paidBy.id !== me.user.id && !others.some((m) => m.userId === expense.paidBy!.id)
                ? [[expense.paidBy.id, expense.paidBy.name ?? "Team member"] as [string, string]]
                : []),
            ].map(([id, text]) => (
              <button
                key={id || "business"}
                type="button"
                aria-pressed={paidBy === id}
                onClick={() => setPaidBy(id!)}
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-4 text-sm font-bold transition disabled:opacity-60",
                  paidBy === id ? "bg-gradient-primary text-on-brand shadow-soft" : "border border-line bg-surface text-ink hover:bg-cream",
                )}
              >
                {text}
              </button>
            ))}
          </div>
          {paidBy && <p className="mt-1.5 text-sm text-ink-muted">Shows under &ldquo;To pay back&rdquo; until it&apos;s marked paid back.</p>}
          {errors.paidBy && <p className="mt-1 text-sm text-danger">{errors.paidBy}</p>}
        </fieldset>
        {!eventId && (events.data?.length ?? 0) > 0 && (
          <SelectField label="For an event? (optional)" value={forEvent} onChange={(e) => setForEvent(e.target.value)} error={errors.eventId}>
            <option value="">No, for the business</option>
            {events.data!.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
                {ev.startDate ? ` · ${formatDate(ev.startDate, { year: false })}` : ""}
              </option>
            ))}
          </SelectField>
        )}
        {expense?.eventTitle && !eventId && <p className="text-sm text-ink-muted">For {expense.eventTitle}</p>}

        <div>
          <p className="mb-2 text-sm font-semibold">Bill photo</p>
          {receipt && photoUrl ? (
            <div className="flex items-center gap-3">
              <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="block size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-cream">
                {receipt.contentType === "application/pdf" ? (
                  <FileText className="m-auto mt-6 size-8 text-brand-strong" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived links; nothing for next/image to optimise
                  <img src={photoUrl} alt="Bill photo" className="size-full object-cover" />
                )}
              </a>
              {editable && (
                <Button variant="ghost" size="sm" onClick={() => setReceipt(null)}>
                  <X className="size-4" /> Remove
                </Button>
              )}
            </div>
          ) : (
            editable && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  aria-label="Bill photo"
                  onChange={(e) => void pickPhoto(e.target.files?.[0])}
                />
                <Button variant="secondary" onClick={() => fileInput.current?.click()} loading={upload.isPending}>
                  {!upload.isPending && <Camera className="size-4" />} {upload.isPending ? "Adding photo…" : "Add bill photo"}
                </Button>
              </>
            )
          )}
          {errors.receiptFileId && <p className="mt-1 text-sm text-danger">{errors.receiptFileId}</p>}
        </div>

        <div className="rounded-2xl border border-line">
          <button
            type="button"
            onClick={() => setGstOpen((o) => !o)}
            aria-expanded={gstOpen}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold"
          >
            <span>
              GST and bill number
              {!gstOpen && gstShown > 0 && <span className="ml-2 font-normal text-ink-muted">GST {formatMoney(gstShown, { paise: gstShown % 1 !== 0 })}</span>}
            </span>
            <ChevronDown className={cn("size-4 text-ink-muted transition", gstOpen && "rotate-180")} />
          </button>
          {gstOpen && (
            <div className="space-y-4 border-t border-line px-4 pb-4 pt-3">
              <p className="text-sm text-ink-muted">If the bill has GST on it, note it. Your CA can claim it back from the GST you collect.</p>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">GST rate on the bill</legend>
                <div className="flex flex-wrap gap-2">
                  {[...PURCHASE_GST_RATES, ...(gstRate !== null && !PURCHASE_GST_RATES.includes(gstRate) ? [gstRate] : [])].map((r) => {
                    const on = (gstRate ?? 0) === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setGstRate(r || null);
                          setGstTyped("");
                        }}
                        className={cn(
                          "inline-flex h-10 items-center rounded-full px-4 text-sm font-bold transition",
                          on ? "bg-gradient-primary text-on-brand shadow-soft" : "border border-line bg-surface text-ink hover:bg-cream",
                        )}
                      >
                        {r ? `${r}%` : "No GST"}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="GST in the amount (₹)"
                  inputMode="decimal"
                  value={gstTyped}
                  placeholder={gstRate ? String(gstInside(amountNum, gstRate)) : "0"}
                  onChange={(e) => setGstTyped(e.target.value.replace(/[^\d.]/g, ""))}
                  error={errors.gstAmount}
                  hint={gstRate && !gstTyped ? `Worked out at ${gstRate}%. Type to change.` : undefined}
                />
                <TextField label="Their bill number" value={vendorInvoiceNo} onChange={(e) => setVendorInvoiceNo(e.target.value)} error={errors.vendorInvoiceNo} placeholder="INV/245" />
              </div>
            </div>
          )}
        </div>

        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
      </fieldset>

      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      {editable && (
        <Button type="submit" size="lg" loading={create.isPending || update.isPending} disabled={upload.isPending}>
          {expense ? (expense.status === "rejected" && !approver ? "Send again" : "Save") : approver ? "Add expense" : "Send for approval"}
        </Button>
      )}

      {expense && editable && (
        <Button variant="ghost" size="lg" className="text-danger" onClick={deleteIt} loading={remove.isPending}>
          Remove this expense
        </Button>
      )}
    </form>
  );
}

/** One expense in a list. */
export function ExpenseRow({ expense, onClick, showEvent = true }: { expense: Expense; onClick: () => void; showEvent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-cream">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
        <OptionIcon optionKey={expense.category} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold tabular">
          {formatMoney(expense.amount, { paise: expense.amount % 1 !== 0 })} · {expense.categoryLabel}
        </span>
        <span className="block truncate text-sm text-ink-muted">
          {[
            formatDate(expense.spentOn, { year: false }),
            expense.vendorName ?? expense.paidTo,
            expense.methodLabel,
            showEvent ? expense.eventTitle : null,
            expense.paidBy ? `${expense.paidBy.name ?? "Team"} paid` : expense.submittedBy?.name,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {expense.receipt && <Camera className="size-4 shrink-0 text-ink-subtle" aria-label="Has a bill photo" />}
      {expense.status === "approved" && expense.paidBy && !expense.reimbursedAt && (
        <span className="shrink-0 rounded-full bg-sun-50 px-2.5 py-1 text-xs font-semibold text-brand-strong">To pay back</span>
      )}
      {expense.status !== "approved" && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            expense.status === "pending" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger",
          )}
        >
          {expense.status === "pending" ? "Waiting" : "Sent back"}
        </span>
      )}
    </button>
  );
}
