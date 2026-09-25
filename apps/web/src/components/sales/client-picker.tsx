"use client";

import { formatPhone } from "@wedding-yantra/core";
import { useClients } from "@wedding-yantra/api-client/react";
import type { PersonRef } from "@wedding-yantra/types";
import { X } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { TextField } from "@/components/ui/field";

/** Find one of your clients by name or number. For people whose role includes clients. */
export function ClientPicker({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: PersonRef | null;
  onChange: (client: PersonRef | null) => void;
  error?: string;
  hint?: string;
}) {
  const { workspace } = useCurrentWorkspace();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const clients = useClients(workspace.id, q);

  if (value) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <div className="flex h-12 items-center justify-between gap-3 rounded-xl border border-sun-300 bg-cream px-4">
          <span className="truncate font-semibold">{value.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={`Remove ${value.name}`}
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
    <div className="space-y-2">
      <TextField label={label} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or number" error={error} hint={hint} />
      {q && (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {clients.data?.slice(0, 6).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: c.id, name: c.name });
                  setSearch("");
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-cream"
              >
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm text-ink-muted tabular">{c.phone ? formatPhone(c.phone) : ""}</span>
              </button>
            </li>
          ))}
          {clients.data?.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">None of your clients match.</li>}
        </ul>
      )}
    </div>
  );
}
