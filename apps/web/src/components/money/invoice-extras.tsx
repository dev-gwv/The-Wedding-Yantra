"use client";

import { can } from "@wedding-yantra/core";
import { useAddSavedText, useBankAccounts, useSavedTexts } from "@wedding-yantra/api-client/react";
import { SAVED_TEXT_LABELS, type BankAccount, type SavedTextKind } from "@wedding-yantra/types";
import { Bookmark, Check, Landmark } from "lucide-react";
import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { TextAreaField } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

const chip = (on: boolean) =>
  cn(
    "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition",
    on ? "bg-gradient-primary text-on-brand shadow-soft" : "border border-line bg-surface text-ink hover:bg-cream",
  );

/** One line that says where an account is: "HDFC Bank · A/c ••6789 · riya@okhdfc". */
export function accountLine(a: Pick<BankAccount, "bankName" | "accountNumber" | "upiId">): string {
  return [a.bankName, a.accountNumber ? `A/c ••${a.accountNumber.slice(-4)}` : null, a.upiId].filter(Boolean).join(" · ");
}

/**
 * Notes or terms on an invoice: tap a saved one to fill it in, or save what's typed for
 * next time. The invoice keeps its own copy, so changing a saved one later changes nothing sent.
 */
export function SavedTextField({
  kind,
  label,
  value,
  onChange,
  error,
  rows,
  placeholder,
}: {
  kind: SavedTextKind;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  rows?: number;
  placeholder?: string;
}) {
  const { workspace } = useCurrentWorkspace();
  const manage = can(workspace.role, "bills.manage");
  const saved = (useSavedTexts(workspace.id).data ?? []).filter((t) => t.kind === kind);
  const add = useAddSavedText(workspace.id);
  const toast = useToast();
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");
  const text = value.trim();
  const isSaved = saved.some((t) => t.body === text);

  async function save() {
    if (!title.trim()) return setNaming(false);
    try {
      await add.mutateAsync({ kind, title: title.trim(), body: text });
      toast(`Saved as ${title.trim()}`);
      setTitle("");
      setNaming(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
    if (e.key === "Escape") setNaming(false);
  };

  return (
    <div>
      {saved.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label={`Saved ${SAVED_TEXT_LABELS[kind].title.toLowerCase()}`}>
          {saved.map((t) => {
            const on = t.body === text;
            return (
              <button key={t.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange(on ? "" : t.body)}>
                {on && <Check className="size-3.5" strokeWidth={3} />} {t.title}
              </button>
            );
          })}
        </div>
      )}
      <TextAreaField
        label={label}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        placeholder={placeholder}
      />
      {manage && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {text && !isSaved && !naming && (
            <button type="button" onClick={() => setNaming(true)} className="inline-flex items-center gap-1 font-semibold text-brand-strong">
              <Bookmark className="size-3.5" /> Save for next time
            </button>
          )}
          {naming && (
            <span className="inline-flex h-9 items-center gap-1 rounded-full border border-sun-300 bg-surface pl-3.5 pr-1 shadow-glow">
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={onKey}
                onBlur={() => !title.trim() && setNaming(false)}
                maxLength={60}
                placeholder="Name it, e.g. Usual terms"
                aria-label="Name for this text"
                className="w-44 bg-transparent text-sm font-semibold outline-none"
              />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void save()} className="rounded-full bg-gradient-primary px-3 py-1 text-xs font-bold text-on-brand">
                Save
              </button>
            </span>
          )}
          <Link href="/app/settings/invoices" className="text-ink-muted hover:text-ink">
            {saved.length ? "Change saved ones" : `Keep your usual ${SAVED_TEXT_LABELS[kind].one} ready in Invoice settings`}
          </Link>
        </div>
      )}
    </div>
  );
}

/** Which account the invoice tells the client to pay into. */
export function BankAccountPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { workspace } = useCurrentWorkspace();
  const accounts = useBankAccounts(workspace.id);
  const all = accounts.data ?? [];
  // A hidden account still shows on the invoice that uses it.
  const shown = all.filter((a) => !a.archived || a.id === value);
  const picked = all.find((a) => a.id === value);
  if (accounts.isPending) return null;
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Landmark className="size-4 text-ink-muted" /> Pay to
      </legend>
      {shown.length === 0 ? (
        <p className="text-sm text-ink-muted">
          <Link href="/app/settings/invoices" className="font-semibold text-brand-strong">
            Add your bank account or UPI ID
          </Link>{" "}
          and it prints on every invoice, so clients know where to pay.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {shown.map((a) => (
              <button key={a.id} type="button" aria-pressed={value === a.id} className={chip(value === a.id)} onClick={() => onChange(a.id)}>
                {a.label}
              </button>
            ))}
            <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
              Don&apos;t show
            </button>
          </div>
          {picked && <p className="mt-1.5 text-sm text-ink-muted tabular">{accountLine(picked)}</p>}
        </>
      )}
    </fieldset>
  );
}
