"use client";

import { followUpPresets } from "@wedding-yantra/core";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

/** Pick when to follow up: a few quick choices, or any date and time. */
export function FollowUpSheet({
  open,
  onClose,
  onPick,
  hasCurrent,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (iso: string | null) => void;
  hasCurrent: boolean;
  busy?: boolean;
}) {
  const [custom, setCustom] = useState("");
  const presets = followUpPresets();

  return (
    <Sheet open={open} onClose={onClose} title="Follow up" description="We'll show it on Home when it's due.">
      <div className="grid grid-cols-2 gap-2">
        {presets.map((p) => (
          <Button key={p.label} variant="secondary" onClick={() => onPick(p.at.toISOString())} disabled={busy}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="mt-5 flex items-end gap-2">
        <TextField
          label="Or pick a date and time"
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="flex-1"
        />
        <Button onClick={() => custom && onPick(new Date(custom).toISOString())} disabled={!custom || busy} className="h-12">
          Set
        </Button>
      </div>
      {hasCurrent && (
        <Button variant="ghost" size="lg" className="mt-3" onClick={() => onPick(null)} disabled={busy}>
          No follow-up needed
        </Button>
      )}
    </Sheet>
  );
}
