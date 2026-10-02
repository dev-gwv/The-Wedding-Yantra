"use client";

import { useSearch } from "@wedding-yantra/api-client/react";
import type { SearchKind, SearchResult } from "@wedding-yantra/types";
import { CalendarDays, ChevronRight, FileText, Inbox, ReceiptIndianRupee, Search, SearchX, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { useCurrentWorkspace } from "./workspace-context";

/** The groups, in the order they're shown. */
const KINDS: { kind: SearchKind; label: string; icon: LucideIcon }[] = [
  { kind: "lead", label: "Enquiries", icon: Inbox },
  { kind: "client", label: "Clients", icon: UsersRound },
  { kind: "event", label: "Events", icon: CalendarDays },
  { kind: "quote", label: "Quotes", icon: FileText },
  { kind: "bill", label: "Invoices", icon: ReceiptIndianRupee },
];

/** One box for finding anything: an enquiry, a client, an event, a quote or an invoice. */
export function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Search" className="sm:max-w-lg">
      {open && <SearchBody onClose={onClose} />}
    </Sheet>
  );
}

function SearchBody({ onClose }: { onClose: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const search = useSearch(workspace.id, q);

  // After the sheet has opened (and taken focus), the box gets it.
  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, []);

  // Ask the server once typing pauses.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(text.trim()), 250);
    return () => window.clearTimeout(t);
  }, [text]);

  const typed = text.trim();
  const waiting = typed.length >= 2 && (typed !== q || search.isFetching);
  const results = typed === q ? (search.data?.results ?? null) : null;
  const groups = KINDS.map((k) => ({ ...k, items: (results ?? []).filter((r) => r.kind === k.kind) })).filter((g) => g.items.length > 0);
  const first = groups[0]?.items[0];

  function go(r: SearchResult) {
    router.push(r.href);
    onClose();
  }

  return (
    <div className="space-y-4">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (first) go(first);
        }}
      >
        <label htmlFor="app-search" className="sr-only">
          Search
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            ref={input}
            id="app-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search name, phone, quote or invoice no."
            className="h-12 w-full rounded-xl border border-line bg-surface pl-12 pr-10 text-base text-ink placeholder:text-ink-subtle transition-all focus:border-sun-300 focus:shadow-glow focus:outline-none"
          />
          {waiting && <Spinner className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />}
        </div>
      </form>

      <div aria-live="polite" className="min-h-40">
        {typed.length < 2 ? (
          <p className="px-1 py-6 text-center text-sm text-ink-muted">
            Type at least 2 letters or digits: a name, a phone number, or a quote or invoice number.
          </p>
        ) : search.isError && !waiting ? (
          <Notice tone="danger">{errorMessage(search.error)}</Notice>
        ) : !results ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted">
            <Spinner className="size-4" /> Searching…
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-cream text-brand-strong">
              <SearchX className="size-6" />
            </span>
            <p className="mt-3 font-bold">Nothing found for &ldquo;{q}&rdquo;</p>
            <p className="mt-1 text-sm text-ink-muted">Try fewer letters, the last 4 digits of the phone, or the number on the quote.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(({ kind, label, icon: Icon, items }) => (
              <section key={kind} aria-label={label}>
                <h3 className="mb-1.5 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">{label}</h3>
                <ul className="-mx-2">
                  {items.map((r) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <Link
                        href={r.href}
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-cream focus-visible:bg-cream focus-visible:outline-none"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{r.title}</span>
                          {r.subtitle && <span className="block truncate text-sm text-ink-muted">{r.subtitle}</span>}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
