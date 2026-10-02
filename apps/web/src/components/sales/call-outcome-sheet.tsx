"use client";

import { formatFollowUp } from "@wedding-yantra/core";
import { useAddLeadActivity, useUpdateLead } from "@wedding-yantra/api-client/react";
import type { Lead } from "@wedding-yantra/types";
import { useEffect, useRef, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { FollowUpChips, followUpFor, type FollowUpChoice } from "./follow-up-chips";

const OUTCOMES = [
  { key: "interested", label: "Interested", followUp: "tomorrow" },
  { key: "call_back", label: "Call back", followUp: "tomorrow" },
  { key: "not_now", label: "Not now", followUp: "week" },
  { key: "booked_elsewhere", label: "Booked elsewhere", followUp: "none" },
] as const satisfies readonly { key: string; label: string; followUp: FollowUpChoice }[];
type Outcome = (typeof OUTCOMES)[number]["key"];

/**
 * After a call: how it went, a note, and when to follow up. Saved as a call on the lead's
 * history. Closing it without saving still notes that a call was made.
 */
export function CallOutcomeSheet({
  open,
  onClose,
  lead,
  onMarkLost,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  /** Moves the lead to Lost (they chose another vendor). Left out when the viewer can't. */
  onMarkLost?: () => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const log = useAddLeadActivity(workspace.id, lead.id);
  // Set once the call is saved or skipped, so it's logged once only.
  const done = useRef(false);
  useEffect(() => {
    if (open) done.current = false;
  }, [open]);

  function finish() {
    done.current = true;
    onClose();
  }

  function dismiss() {
    if (!done.current) log.mutate({ kind: "call" });
    finish();
  }

  return (
    <Sheet open={open} onClose={dismiss} title="How did the call go?" description={lead.name}>
      {open && <CallOutcomeForm lead={lead} onSaved={() => (done.current = true)} onClose={finish} onMarkLost={onMarkLost} />}
    </Sheet>
  );
}

function CallOutcomeForm({
  lead,
  onSaved,
  onClose,
  onMarkLost,
}: {
  lead: Lead;
  onSaved: () => void;
  onClose: () => void;
  onMarkLost?: () => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const log = useAddLeadActivity(workspace.id, lead.id);
  const update = useUpdateLead(workspace.id, lead.id);
  const toast = useToast();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpChoice | null>("tomorrow");
  const [pickedDate, setPickedDate] = useState("");
  const [askLost, setAskLost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);
  const busy = log.isPending || update.isPending;
  const open = lead.stageKind === "open";

  function pickOutcome(key: Outcome) {
    setOutcome(key);
    setFollowUp(OUTCOMES.find((o) => o.key === key)?.followUp ?? "tomorrow");
  }

  async function save() {
    setError(null);
    const label = OUTCOMES.find((o) => o.key === outcome)?.label;
    const body = [label, note.trim()].filter(Boolean).join(" · ");
    const at = open ? followUpFor(followUp, pickedDate) : undefined;
    if (open && followUp === "pick" && !at) return setError("Pick a day for the follow-up");
    try {
      // A retry after a failed follow-up doesn't log the call twice.
      if (!logged) {
        await log.mutateAsync({ kind: "call", ...(body ? { body } : {}) });
        setLogged(true);
        onSaved();
      }
      // Only touch the follow-up when it changes something.
      if (at !== undefined && !(at === null && !lead.nextFollowUpAt)) await update.mutateAsync({ nextFollowUpAt: at });
    } catch (err) {
      return setError(errorMessage(err));
    }
    toast(at ? `Call saved. Follow up ${formatFollowUp(at)}` : "Call saved");
    if (outcome === "booked_elsewhere" && open && onMarkLost) setAskLost(true);
    else onClose();
  }

  if (askLost) {
    return (
      <div className="space-y-4">
        <p className="text-[15px]">
          They booked someone else. Mark <span className="font-bold">{lead.name}</span> as lost?
        </p>
        <div className="grid gap-2">
          <Button size="lg" onClick={onMarkLost}>
            Mark lost
          </Button>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Keep it open
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map((o) => {
          const on = outcome === o.key;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={on}
              onClick={() => pickOutcome(o.key)}
              className={cn(
                "h-11 rounded-full px-4 text-[15px] font-bold transition",
                on ? "bg-gradient-primary text-on-brand shadow-soft" : "border border-line bg-surface text-ink hover:border-sun-300 hover:bg-cream",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <TextAreaField label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: what they said" maxLength={1900} />
      {open && <FollowUpChips value={followUp} onChange={setFollowUp} pickedDate={pickedDate} onPickedDate={setPickedDate} allowNone />}
      {error && <Notice tone="danger">{error}</Notice>}
      <Button size="lg" onClick={() => void save()} loading={busy}>
        Save
      </Button>
    </div>
  );
}
