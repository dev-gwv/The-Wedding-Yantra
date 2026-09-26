"use client";

import { can, localISODate, planStatus } from "@wedding-yantra/core";
import {
  useAddBankAccount,
  useAddSavedText,
  useBankAccounts,
  useDeleteSavedText,
  useSavedTexts,
  useUpdateBankAccount,
  useUpdateSavedText,
  useUpdateWorkspace,
  useWorkspace,
} from "@wedding-yantra/api-client/react";
import {
  bankAccountInput,
  INVOICE_ACCENTS,
  INVOICE_DESIGN_INFO,
  INVOICE_DESIGNS,
  SAVED_TEXT_KINDS,
  SAVED_TEXT_LABELS,
  savedTextInput,
  type BankAccount,
  type InvoiceDesign,
  type SavedText,
  type SavedTextKind,
  type Workspace,
} from "@wedding-yantra/types";
import { Check, ChevronRight, Landmark, Plus, Star } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { BillDocument, type BillDocumentProps } from "@/components/money/bill-document";
import { accountLine } from "@/components/money/invoice-extras";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

/** How invoices look and what they carry: the design, numbers, bank accounts and saved texts. */
export default function InvoiceSettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const details = useWorkspace(workspace.id);
  const allowed = can(workspace.role, "bills.manage") || can(workspace.role, "finance.view");
  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Invoice settings" subtitle="Set these once. Every new invoice picks them up, and you can change them on any invoice." />
      {!allowed && <Notice>Invoice settings are for the owner and managers.</Notice>}
      {allowed && details.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {details.isError && <Notice tone="danger">{errorMessage(details.error)}</Notice>}
      {allowed && details.data && (
        <div className="space-y-6">
          <LookCard key={details.data.id} workspace={details.data} />
          <BankAccountsCard />
          <SavedTextsCard />
          <NumberingCard workspace={details.data} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Design and colour, with a live preview
// ---------------------------------------------------------------------------

function LookCard({ workspace }: { workspace: Workspace }) {
  const editable = can(workspace.role, "workspace.update");
  const update = useUpdateWorkspace(workspace.id);
  const accounts = useBankAccounts(workspace.id);
  const texts = useSavedTexts(workspace.id);
  const toast = useToast();
  const [design, setDesign] = useState<InvoiceDesign>(workspace.invoiceDesign);
  const [accent, setAccent] = useState(workspace.invoiceAccent);
  const [custom, setCustom] = useState(INVOICE_ACCENTS.some((a) => a.hex === workspace.invoiceAccent) ? "" : workspace.invoiceAccent);

  function save(next: { invoiceDesign?: InvoiceDesign; invoiceAccent?: string }) {
    if (next.invoiceDesign) setDesign(next.invoiceDesign);
    if (next.invoiceAccent) setAccent(next.invoiceAccent);
    update.mutate(next, { onError: (err) => toast(errorMessage(err), "error") });
  }

  const bank = accounts.data?.find((a) => a.isDefault) ?? null;
  const terms = texts.data?.find((t) => t.kind === "terms" && t.isDefault)?.body ?? "50% advance to book the date. Balance before the event.";

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">How your invoice looks</h2>
      <p className="mt-0.5 text-sm text-ink-muted">Clients see this when you send the invoice link, and when it&apos;s saved as a PDF.</p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
        <div className="space-y-6">
          <fieldset disabled={!editable}>
            <legend className="mb-2 text-sm font-semibold">Design</legend>
            <div className="grid grid-cols-2 gap-3">
              {INVOICE_DESIGNS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={design === d}
                  onClick={() => save({ invoiceDesign: d })}
                  className={cn(
                    "rounded-2xl border p-3 text-left transition disabled:opacity-60",
                    design === d ? "border-brand bg-sun-50 ring-2 ring-sun-300/60" : "border-line bg-surface hover:border-sun-300",
                  )}
                >
                  <DesignThumb design={d} accent={accent} />
                  <span className="mt-2 flex items-center gap-1.5 text-sm font-bold">
                    {design === d && <Check className="size-3.5 text-brand-strong" strokeWidth={3} />}
                    {INVOICE_DESIGN_INFO[d].name}
                  </span>
                  <span className="block text-xs text-ink-muted">{INVOICE_DESIGN_INFO[d].about}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={!editable}>
            <legend className="mb-2 text-sm font-semibold">Colour</legend>
            <div className="flex flex-wrap gap-2.5">
              {INVOICE_ACCENTS.map((a) => (
                <button
                  key={a.hex}
                  type="button"
                  aria-pressed={accent === a.hex}
                  aria-label={a.name}
                  title={a.name}
                  onClick={() => {
                    setCustom("");
                    save({ invoiceAccent: a.hex });
                  }}
                  className={cn("grid size-10 place-items-center rounded-full ring-offset-2 transition", accent === a.hex ? "ring-2 ring-ink" : "hover:scale-105")}
                  style={{ background: a.hex }}
                >
                  {accent === a.hex && <Check className="size-4 text-white" strokeWidth={3} />}
                </button>
              ))}
              <label
                className={cn(
                  "relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line-strong ring-offset-2",
                  custom && accent === custom && "ring-2 ring-ink",
                )}
                title="Your own colour"
                style={custom ? { background: custom } : undefined}
              >
                {!custom && <Plus className="size-4 text-ink-muted" />}
                <input
                  type="color"
                  aria-label="Your own colour"
                  value={custom || accent}
                  onChange={(e) => setCustom(e.target.value.toUpperCase())}
                  onBlur={(e) => save({ invoiceAccent: e.target.value.toUpperCase() })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
          </fieldset>
          {!editable && <p className="text-sm text-ink-muted">Only the owner or a manager can change the look.</p>}
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-sm font-semibold">Preview</p>
          <div className="max-h-[640px] overflow-auto rounded-3xl bg-cream p-3 sm:p-4">
            <BillDocument
              business={{
                name: workspace.name,
                typeName: workspace.businessTypeName,
                icon: workspace.businessTypeIcon,
                city: workspace.city,
                phone: workspace.phone,
                email: workspace.email,
                address: workspace.address,
                logoUrl: workspace.logoUrl,
                invoiceDesign: design,
                invoiceAccent: custom && accent !== custom ? custom : accent,
              }}
              bill={sampleBill(workspace, bank, terms)}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** A small drawing of each design, in the chosen colour. */
function DesignThumb({ design, accent }: { design: InvoiceDesign; accent: string }) {
  const bar = (w: string, c = "#E7DDCB") => <span className="block h-1.5 rounded-full" style={{ width: w, background: c }} />;
  return (
    <span
      className={cn(
        "block aspect-[4/3] overflow-hidden rounded-xl border border-line bg-white",
        design === "bold" && "border-l-[6px]",
        design === "classic" && "border-t-[3px]",
      )}
      style={design === "bold" ? { borderLeftColor: accent } : design === "classic" ? { borderTopColor: accent } : undefined}
      aria-hidden
    >
      <span className="block space-y-1 px-2.5 py-2" style={design === "modern" ? { background: accent } : undefined}>
        {bar("45%", design === "modern" ? "rgba(255,255,255,.9)" : design === "bold" ? accent : "#CDBFA6")}
        {bar("30%", design === "modern" ? "rgba(255,255,255,.6)" : "#E7DDCB")}
      </span>
      <span className="block space-y-1.5 px-2.5 py-2">
        <span className={cn("block h-2 rounded", design === "minimal" && "opacity-0")} style={{ background: design === "modern" ? `color-mix(in srgb, ${accent} 12%, white)` : "#F4EDE1" }} />
        {bar("90%")}
        {bar("75%")}
        <span className="flex justify-end">
          <span className="block h-2.5 w-1/3 rounded" style={{ background: design === "bold" ? accent : design === "minimal" ? "#CDBFA6" : accent }} />
        </span>
      </span>
    </span>
  );
}

function sampleBill(workspace: Workspace, bank: BankAccount | null, terms: string): BillDocumentProps["bill"] {
  const gst = !!workspace.gstin;
  const today = localISODate();
  const items = [
    { name: "Main service, wedding day", description: "Everything agreed for the day", rate: 45000 },
    { name: "Extra function", description: "Haldi or mehendi, morning", rate: 15000 },
  ].map((x, i) => {
    const tax = gst ? Math.round(x.rate * 0.18) : 0;
    return {
      id: `sample-${i}`,
      catalogueItemId: null,
      name: x.name,
      description: x.description,
      sac: gst ? "998596" : null,
      unit: "event" as const,
      quantity: 1,
      rate: x.rate,
      taxRate: gst ? 18 : 0,
      amount: x.rate,
      discount: 0,
      taxable: x.rate,
      cgst: tax / 2,
      sgst: tax / 2,
      igst: 0,
    };
  });
  const subtotal = 60000;
  const tax = gst ? 10800 : 0;
  const total = subtotal + tax;
  return {
    id: "sample",
    number: `${workspace.billPrefix}/26-27/0001`,
    status: "issued",
    payState: "part_paid",
    overdue: false,
    clientName: "Neha Kapoor",
    eventTitle: null,
    issueDate: today,
    dueDate: today,
    total,
    received: 20000,
    due: total - 20000,
    createdAt: new Date().toISOString(),
    billTo: { name: "Neha Kapoor", phone: "+919811111111", address: "Greater Kailash II, New Delhi", gstin: null },
    subject: "Wedding, 14 and 15 November",
    pricesIncludeGst: false,
    discountPercent: null,
    sellerGstin: workspace.gstin,
    chargesGst: gst,
    placeOfSupply: gst ? workspace.gstin!.slice(0, 2) : null,
    interState: false,
    items,
    subtotal,
    discount: 0,
    taxable: subtotal,
    cgst: tax / 2,
    sgst: tax / 2,
    igst: 0,
    tax,
    roundOff: 0,
    byRate: gst ? [{ rate: 18, taxable: subtotal, cgst: tax / 2, sgst: tax / 2, igst: 0 }] : [],
    notes: "Thank you for choosing us!",
    terms,
    plan: planStatus(
      [
        { label: "Advance to book", percent: 50, amount: total / 2, dueDate: today },
        { label: "Balance, before the event", percent: 50, amount: total / 2, dueDate: null },
      ],
      20000,
      today,
    ),
    dueNow: 0,
    deliverables: [
      { title: "Edited photos", dueDate: null, deliverableId: null, status: null, deliveredAt: null },
      { title: "Teaser reel", dueDate: null, deliverableId: null, status: null, deliveredAt: null },
    ],
    bankAccountId: bank?.id ?? null,
    bank,
    cancelledAt: null,
    cancelReason: null,
    payments: [{ number: "R-0001", amount: 20000, paidOn: today, method: "upi", methodLabel: "UPI" }],
  };
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

function BankAccountsCard() {
  const { workspace } = useCurrentWorkspace();
  const editable = can(workspace.role, "bills.manage");
  const accounts = useBankAccounts(workspace.id);
  const [open, setOpen] = useState<BankAccount | "new" | null>(null);
  const live = (accounts.data ?? []).filter((a) => !a.archived);
  const hidden = (accounts.data ?? []).filter((a) => a.archived);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold">Bank accounts</h2>
          <p className="mt-0.5 text-sm text-ink-muted">Printed under &ldquo;Pay to&rdquo;. The UPI ID also powers the Pay button on the invoice link.</p>
        </div>
        {editable && (
          <Button variant="secondary" size="sm" onClick={() => setOpen("new")}>
            <Plus className="size-4" strokeWidth={2.5} /> Add account
          </Button>
        )}
      </div>
      {accounts.data && live.length === 0 && (
        <p className="mt-4 rounded-2xl bg-cream p-4 text-sm">No account yet. Add your bank details or just a UPI ID, and every new invoice shows where to pay.</p>
      )}
      {live.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {[...live, ...hidden].map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => editable && setOpen(a)}
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left", editable && "hover:bg-cream", a.archived && "opacity-60")}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
                  <Landmark className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-bold">
                    {a.label}
                    {a.isDefault && <span className="rounded-full bg-sun-50 px-2 py-0.5 text-xs font-semibold text-brand-strong">Default</span>}
                    {a.archived && <span className="rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-ink-muted">Hidden</span>}
                  </span>
                  <span className="block truncate text-sm text-ink-muted tabular">{accountLine(a)}</span>
                </span>
                {editable && <ChevronRight className="size-4 shrink-0 text-ink-subtle" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open === "new" ? "Add bank account" : "Bank account"}>
        {open !== null && <BankAccountForm account={open === "new" ? undefined : open} onDone={() => setOpen(null)} />}
      </Sheet>
    </Card>
  );
}

function BankAccountForm({ account, onDone }: { account?: BankAccount; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const add = useAddBankAccount(workspace.id);
  const update = useUpdateBankAccount(workspace.id);
  const toast = useToast();
  const [v, setV] = useState({
    label: account?.label ?? "",
    accountName: account?.accountName ?? workspace.name,
    accountNumber: account?.accountNumber ?? "",
    ifsc: account?.ifsc ?? "",
    bankName: account?.bankName ?? "",
    branch: account?.branch ?? "",
    upiId: account?.upiId ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(bankAccountInput, v);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (account) await update.mutateAsync({ id: account.id, ...v });
      else await add.mutateAsync(v);
      toast(account ? "Account saved" : "Account added");
      onDone();
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  async function change(input: { isDefault?: boolean; archived?: boolean }, message: string) {
    if (!account) return;
    try {
      await update.mutateAsync({ id: account.id, ...input });
      toast(message);
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Name for this account" value={v.label} onChange={set("label")} error={errors.label} placeholder="HDFC current" />
      <TextField label="Account holder's name" value={v.accountName} onChange={set("accountName")} error={errors.accountName} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Account number" inputMode="numeric" value={v.accountNumber} onChange={set("accountNumber")} error={errors.accountNumber} />
        <TextField label="IFSC" value={v.ifsc} onChange={(e) => setV((x) => ({ ...x, ifsc: e.target.value.toUpperCase() }))} error={errors.ifsc} placeholder="HDFC0001234" />
        <TextField label="Bank (optional)" value={v.bankName} onChange={set("bankName")} error={errors.bankName} placeholder="HDFC Bank" />
        <TextField label="Branch (optional)" value={v.branch} onChange={set("branch")} error={errors.branch} placeholder="Greater Kailash II" />
      </div>
      <TextField
        label="UPI ID (optional)"
        value={v.upiId}
        onChange={set("upiId")}
        error={errors.upiId}
        placeholder="yourname@okhdfc"
        hint="Clients get a Pay button with the amount filled in. A UPI ID alone is fine too."
      />
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={add.isPending || update.isPending}>
        {account ? "Save" : "Add account"}
      </Button>
      {account && (
        <div className="flex flex-wrap gap-2">
          {!account.isDefault && !account.archived && (
            <Button variant="secondary" onClick={() => change({ isDefault: true }, `${account.label} is the default now`)}>
              <Star className="size-4" /> Make default
            </Button>
          )}
          <Button variant="ghost" onClick={() => change({ archived: !account.archived }, account.archived ? "Shown again" : "Hidden. Invoices already made keep it.")}>
            {account.archived ? "Show again" : "Hide this account"}
          </Button>
        </div>
      )}
      <p className="text-xs text-ink-muted">Changes apply to new invoices. Ones already made keep the details they were sent with.</p>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Saved notes and terms
// ---------------------------------------------------------------------------

function SavedTextsCard() {
  const { workspace } = useCurrentWorkspace();
  const editable = can(workspace.role, "bills.manage");
  const texts = useSavedTexts(workspace.id);
  const [open, setOpen] = useState<SavedText | SavedTextKind | null>(null);
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">Saved notes and terms</h2>
      <p className="mt-0.5 text-sm text-ink-muted">Write them once and pick one on an invoice with a tap. The default fills in by itself.</p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {SAVED_TEXT_KINDS.map((kind) => {
          const list = (texts.data ?? []).filter((t) => t.kind === kind);
          return (
            <div key={kind}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{SAVED_TEXT_LABELS[kind].title}</p>
                {editable && (
                  <button type="button" onClick={() => setOpen(kind)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong">
                    <Plus className="size-4" /> Add
                  </button>
                )}
              </div>
              {list.length === 0 ? (
                <p className="rounded-2xl bg-cream p-4 text-sm text-ink-muted">{SAVED_TEXT_LABELS[kind].about}</p>
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {list.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => editable && setOpen(t)} className={cn("block w-full px-4 py-3 text-left", editable && "hover:bg-cream")}>
                        <span className="flex items-center gap-2 font-bold">
                          {t.title}
                          {t.isDefault && <span className="rounded-full bg-sun-50 px-2 py-0.5 text-xs font-semibold text-brand-strong">Default</span>}
                        </span>
                        <span className="line-clamp-2 whitespace-pre-line text-sm text-ink-muted">{t.body}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={typeof open === "string" ? `New ${SAVED_TEXT_LABELS[open].one}` : (open?.title ?? "")}
      >
        {open !== null && <SavedTextForm key={typeof open === "string" ? open : open.id} text={typeof open === "string" ? undefined : open} kind={typeof open === "string" ? open : open.kind} onDone={() => setOpen(null)} />}
      </Sheet>
    </Card>
  );
}

function SavedTextForm({ text, kind, onDone }: { text?: SavedText; kind: SavedTextKind; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const add = useAddSavedText(workspace.id);
  const update = useUpdateSavedText(workspace.id);
  const remove = useDeleteSavedText(workspace.id);
  const toast = useToast();
  const [title, setTitle] = useState(text?.title ?? "");
  const [body, setBody] = useState(text?.body ?? "");
  const [isDefault, setIsDefault] = useState(text?.isDefault ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(savedTextInput, { kind, title, body, isDefault });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (text) await update.mutateAsync({ id: text.id, title, body, isDefault });
      else await add.mutateAsync({ kind, title, body, ...(isDefault ? { isDefault } : {}) });
      toast("Saved");
      onDone();
    } catch (err) {
      const f = apiFieldErrors(err);
      setErrors(Object.keys(f).length ? f : { _: errorMessage(err) });
    }
  }

  async function deleteIt() {
    if (!text) return;
    try {
      await remove.mutateAsync(text.id);
      toast("Removed. Invoices already made keep their copy.");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField label="Name" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder={kind === "terms" ? "Usual terms" : "Thank you"} />
      <TextAreaField
        label={kind === "terms" ? "Terms" : "Note"}
        rows={kind === "terms" ? 7 : 4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
        placeholder={
          kind === "terms"
            ? "50% advance to book the date.\nBalance before the event.\nAdvance is not refundable if the booking is cancelled."
            : "Thank you for choosing us! We look forward to your big day."
        }
      />
      <label className="flex items-center gap-3 text-[15px] font-semibold">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="size-5 accent-[var(--color-brand)]" />
        Fill this in on every new invoice
      </label>
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={add.isPending || update.isPending}>
        Save
      </Button>
      {text && (
        <Button variant="ghost" size="lg" className="text-danger" onClick={deleteIt} loading={remove.isPending}>
          Remove
        </Button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Invoice numbers
// ---------------------------------------------------------------------------

function NumberingCard({ workspace }: { workspace: Workspace }) {
  const editable = can(workspace.role, "workspace.update");
  const update = useUpdateWorkspace(workspace.id);
  const toast = useToast();
  const [prefix, setPrefix] = useState(workspace.billPrefix);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({ billPrefix: prefix });
      setError(undefined);
      toast("Saved");
    } catch (err) {
      setError(apiFieldErrors(err).billPrefix ?? errorMessage(err));
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">Invoice numbers</h2>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-start gap-3">
        <TextField
          label="Starts with"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          maxLength={5}
          disabled={!editable}
          error={error}
          hint={`New invoices look like ${(prefix || "INV").toUpperCase()}/26-27/0001, counted afresh each financial year.`}
          className="min-w-0 flex-1"
        />
        {editable && (
          <Button type="submit" variant="secondary" className="mt-7" loading={update.isPending} disabled={prefix === workspace.billPrefix}>
            Save
          </Button>
        )}
      </form>
    </Card>
  );
}
