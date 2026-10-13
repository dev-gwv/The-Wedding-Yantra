"use client";

import { useLeadRouting, useSetLeadRouting, useTeam } from "@wedding-yantra/api-client/react";
import type { LeadRouting, LeadRoutingInput } from "@wedding-yantra/types";
import { Check, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, Card, IconSquare, Notice } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { Chip, plural } from "./chips";

type Settings = Required<LeadRoutingInput>;

const fromSaved = (r: LeadRouting): Settings => ({
  everyoneWithLeads: r.everyoneWithLeads,
  people: r.people.map((p) => p.userId),
  includeOwner: r.includeOwner,
  skipOnLeave: r.skipOnLeave,
});

function Choice({ on, onPick, title, hint }: { on: boolean; onPick: () => void; title: string; hint: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition", on ? "border-brand bg-cream" : "border-line hover:border-sun-300")}>
      <input type="radio" name="lead-routing-mode" checked={on} onChange={onPick} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-brand" : "border-line-strong")}
      >
        {on && <span className="size-2.5 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}

function SwitchRow({ title, hint, checked, onChange }: { title: string; hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** "Who gets these leads": everyone with the Leads screen, or the people the owner picks. */
export function RoutingPicker({ workspaceId }: { workspaceId: string }) {
  const routing = useLeadRouting(workspaceId);
  const team = useTeam(workspaceId);
  const save = useSetLeadRouting(workspaceId);
  const toast = useToast();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (routing.isPending || team.isPending) {
    return (
      <Card className="flex justify-center py-10 text-brand">
        <Spinner />
      </Card>
    );
  }
  if (routing.isError || team.isError) {
    return (
      <Card className="p-5">
        <Notice tone="danger">{errorMessage(routing.error ?? team.error)}</Notice>
      </Card>
    );
  }

  const value = draft ?? fromSaved(routing.data);
  const change = (patch: Partial<Settings>) => setDraft({ ...value, ...patch });
  // Only people who can work leads can be given them.
  const sellers = team.data.members.filter((m) => m.permissions.includes("leads.work"));
  const pickable = new Set(sellers.map((m) => m.userId));
  const pool = [...routing.data.pool].sort((a, b) => a.openLeads - b.openLeads);
  // Picking people means at least one (the server refuses none).
  const nobody = !value.everyoneWithLeads && !value.people.some((id) => pickable.has(id));

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({ ...value, people: value.people.filter((id) => pickable.has(id)) });
      setDraft(null);
      toast("Saved: new leads go to the people shown");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card id="who-gets" className="scroll-mt-6 p-5">
      <div className="flex items-start gap-3">
        <IconSquare icon={Users} />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-extrabold">Who gets these leads</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Each new lead goes to whoever has the fewest open leads. They get the &ldquo;New enquiry&rdquo; alert.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2" role="radiogroup" aria-label="Who gets these leads">
        <Choice
          on={value.everyoneWithLeads}
          onPick={() => change({ everyoneWithLeads: true })}
          title="Everyone with the Leads screen"
          hint="New salespeople join by themselves."
        />
        <Choice
          on={!value.everyoneWithLeads}
          // Starts with everyone who gets them now, so the owner only unticks.
          onPick={() =>
            change({ everyoneWithLeads: false, people: value.people.length ? value.people : routing.data.pool.map((p) => p.userId).filter((id) => pickable.has(id)) })
          }
          title="Only the people I pick"
          hint="Untick anyone who shouldn't get them."
        />
      </div>

      {!value.everyoneWithLeads && (
        <ul className="mt-3 space-y-1">
          {sellers.map((m) => {
            const on = value.people.includes(m.userId);
            return (
              <li key={m.userId}>
                <label className={cn("flex cursor-pointer items-center gap-3 rounded-2xl px-2 py-1.5 transition", on && "bg-cream")}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => change({ people: e.target.checked ? [...value.people, m.userId] : value.people.filter((id) => id !== m.userId) })}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-lg border-2 transition",
                      on ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface",
                    )}
                  >
                    {on && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <Avatar name={m.name} muted={!on} className="size-9 text-xs" />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {m.name ?? m.phone}
                    {m.isYou && <span className="font-normal text-ink-muted"> (you)</span>}
                  </span>
                </label>
              </li>
            );
          })}
          {nobody && <li className="px-2 pt-1 text-sm text-ink-muted">Tick at least one person, or choose everyone with the Leads screen.</li>}
        </ul>
      )}

      <div className="mt-5 space-y-4 border-t border-line pt-4">
        {value.everyoneWithLeads && (
          <SwitchRow title="Give leads to me too" hint="You get them like a salesperson." checked={value.includeOwner} onChange={(v) => change({ includeOwner: v })} />
        )}
        <SwitchRow
          title="Skip people on leave today"
          hint="Unless everyone is on leave."
          checked={value.skipOnLeave}
          onChange={(v) => change({ skipOnLeave: v })}
        />
      </div>

      {error && (
        <div className="mt-4">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}
      {draft && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button loading={save.isPending} disabled={nobody} onClick={() => void submit()}>
            Save
          </Button>
          <Button
            variant="ghost"
            disabled={save.isPending}
            onClick={() => {
              setDraft(null);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-5 rounded-2xl bg-cream p-4">
        <p className="text-sm font-bold">{draft ? "With the saved settings, leads go to" : "Leads go to"}</p>
        {pool.length ? (
          <ul className="mt-2 space-y-2">
            {pool.map((p) => (
              <li key={p.userId} className="flex items-center gap-3">
                <Avatar name={p.name} muted={p.onLeave} className="size-8 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name ?? "Someone"}</span>
                  {p.onLeave && (
                    <span className="mt-0.5 block">
                      <Chip tone="warning">On leave today</Chip>
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-sm text-ink-muted tabular">{plural(p.openLeads, "open lead")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">Nobody with the Leads screen yet, so every lead goes to you.</p>
        )}
      </div>
    </Card>
  );
}
