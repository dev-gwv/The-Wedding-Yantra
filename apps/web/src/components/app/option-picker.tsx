"use client";

import { useAddOption, useOptions } from "@wedding-yantra/api-client/react";
import { can, OPTION_LIST_INFO, optionLabel, type OptionList } from "@wedding-yantra/core";
import type { CustomOption } from "@wedding-yantra/types";
import {
  Banknote,
  Briefcase,
  Car,
  Check,
  CreditCard,
  FileText,
  Hammer,
  Landmark,
  Megaphone,
  Package,
  Plus,
  Smartphone,
  Store,
  Tag,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { createElement, useState, type KeyboardEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/** Icons for the built-in options; the business's own get a plain tag. */
const ICONS: Record<string, LucideIcon> = {
  upi: Smartphone,
  cash: Banknote,
  bank: Landmark,
  cheque: FileText,
  card: CreditCard,
  other: Wallet,
  materials: Package,
  vendor: Store,
  staff: Users,
  travel: Car,
  food: UtensilsCrossed,
  equipment: Hammer,
  rent: Briefcase,
  marketing: Megaphone,
};
/** The icon for an option: a built-in's own drawing, or a plain tag for the business's own. */
export function OptionIcon({ optionKey, className }: { optionKey: string | null | undefined; className?: string }) {
  return createElement((optionKey && ICONS[optionKey]) || Tag, { className });
}

/** A list's options in order, and a name for any key (hidden ones included). */
export function useOptionList(list: OptionList) {
  const { workspace } = useCurrentWorkspace();
  const all = useOptions(workspace.id);
  const options = (all.data ?? []).filter((o) => o.list === list).sort((a, b) => a.position - b.position);
  return {
    options,
    active: options.filter((o) => !o.archived),
    loading: all.isPending,
    labelOf: (key: string | null | undefined) => optionLabel(options, list, key),
  };
}

/**
 * Pick one option as pills, or add a new one right here: type a name and press Enter.
 * The same name in other capitals picks the existing one instead of adding it twice.
 */
export function OptionPills({
  list,
  value,
  onChange,
  disabled,
  label,
  error,
  allowNone,
}: {
  list: OptionList;
  value: string | null;
  onChange: (key: string | null) => void;
  disabled?: boolean;
  label: string;
  error?: string;
  /** Tapping the chosen one again clears it */
  allowNone?: boolean;
}) {
  const { workspace } = useCurrentWorkspace();
  const { active, options } = useOptionList(list);
  const add = useAddOption(workspace.id);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  // A hidden option still shows while a record uses it.
  const current = value ? options.find((o) => o.key === value && o.archived) : undefined;
  const shown: CustomOption[] = current ? [...active, current] : active;

  async function save() {
    const label = name.trim();
    if (!label) return setAdding(false);
    const existing = active.find((o) => o.label.toLowerCase() === label.toLowerCase());
    try {
      const option = existing ?? (await add.mutateAsync({ list, label }));
      onChange(option.key);
      setName("");
      setAdding(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setAdding(false);
    }
  };

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {shown.map((o) => {
          const selected = value === o.key;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(selected && allowNone ? null : o.key)}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition disabled:opacity-60",
                selected ? "bg-gradient-primary text-on-brand shadow-soft" : "border border-line bg-surface text-ink hover:bg-cream",
              )}
            >
              <OptionIcon optionKey={o.key} className="size-4" /> {o.label}
            </button>
          );
        })}
        {!disabled &&
          (adding ? (
            <span className="inline-flex h-10 items-center gap-1 rounded-full border border-sun-300 bg-surface pl-4 pr-1 shadow-glow">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onKey}
                maxLength={40}
                placeholder={`New ${OPTION_LIST_INFO[list].one}`}
                aria-label={`New ${OPTION_LIST_INFO[list].one}`}
                className="w-36 bg-transparent text-sm font-semibold outline-none"
              />
              <button type="button" onClick={() => void save()} className="grid size-8 place-items-center rounded-full bg-gradient-primary text-on-brand" aria-label="Add it">
                <Check className="size-4" strokeWidth={3} />
              </button>
              <button type="button" onClick={() => setAdding(false)} className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-cream" aria-label="Cancel">
                <X className="size-4" />
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-10 items-center gap-1 rounded-full border border-dashed border-line-strong px-4 text-sm font-bold text-brand-strong hover:bg-cream"
            >
              <Plus className="size-4" strokeWidth={2.5} /> Add
            </button>
          ))}
      </div>
      {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
      {can(workspace.role, "workspace.update") && (
        <Link href="/app/settings/lists" className="mt-2 inline-block text-xs font-semibold text-ink-muted hover:text-brand-strong">
          Rename, reorder or hide {OPTION_LIST_INFO[list].title.toLowerCase()}
        </Link>
      )}
    </fieldset>
  );
}

