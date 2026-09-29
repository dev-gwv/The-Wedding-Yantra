"use client";

import { formatPhone } from "@wedding-yantra/core";
import { useClients } from "@wedding-yantra/api-client/react";
import type { PersonRef } from "@wedding-yantra/types";
import { ChevronDown, Search, UserRound, X } from "lucide-react";
import { useDeferredValue, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

export interface PickedClient extends PersonRef {
  phone?: string | null;
}

/** Closes a floating panel on a click outside it or on Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose]);
}

/** The floating list under a search box: scrolls inside itself, never pushes the page down. */
export function DropdownPanel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <div id={id} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-soft">
      {children}
    </div>
  );
}

/**
 * Pick one of your clients from a dropdown: type a name or number to narrow it down. With
 * hundreds of clients the list stays in a small scrolling box under the field.
 */
export function ClientPicker({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder = "Search by name or number",
}: {
  label: string;
  value: PickedClient | null;
  onChange: (client: PickedClient | null) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
}) {
  const { workspace } = useCurrentWorkspace();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDeferredValue(search.trim());
  const clients = useClients(workspace.id, q, false, open);
  const box = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();
  useDismiss(box, open, () => setOpen(false));

  const list = (clients.data ?? []).slice(0, 50);
  const pick = (c: PickedClient) => {
    onChange({ id: c.id, name: c.name, phone: c.phone ?? null });
    setSearch("");
    setOpen(false);
  };

  if (value) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <div className="flex h-12 items-center gap-3 rounded-xl border border-sun-300 bg-cream px-4">
          <UserRound className="size-4 shrink-0 text-brand-strong" />
          <span className="min-w-0 flex-1 truncate font-semibold">{value.name}</span>
          {value.phone && <span className="hidden shrink-0 text-sm text-ink-muted tabular sm:block">{formatPhone(value.phone)}</span>}
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Change ${value.name}`}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <div ref={box} className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={search}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, list.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && open && list[active]) {
              e.preventDefault();
              pick(list[active]);
            }
          }}
          className={cn(
            "h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-10 text-[15px] placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none",
            error && "border-danger focus:border-danger",
          )}
        />
        <ChevronDown className={cn("pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle transition", open && "rotate-180")} />
        {open && (
          <DropdownPanel id={listId}>
            {clients.isPending ? (
              <div className="flex justify-center py-4 text-brand">
                <Spinner />
              </div>
            ) : list.length === 0 ? (
              <p className="px-3 py-3 text-sm text-ink-muted">{q ? "None of your clients match." : "No clients yet."}</p>
            ) : (
              <>
                {list.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(c)}
                    className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left", i === active ? "bg-cream" : "hover:bg-cream")}
                  >
                    <span className="min-w-0 truncate font-semibold">{c.name}</span>
                    <span className="shrink-0 text-sm text-ink-muted tabular">{c.phone ? formatPhone(c.phone) : ""}</span>
                  </button>
                ))}
                {(clients.data?.length ?? 0) > list.length && <p className="px-3 py-2 text-xs text-ink-muted">Showing the first {list.length}. Type to narrow it down.</p>}
              </>
            )}
          </DropdownPanel>
        )}
      </div>
      {(error || hint) && <p className={cn("text-sm", error ? "text-danger" : "text-ink-muted")}>{error ?? hint}</p>}
    </div>
  );
}
