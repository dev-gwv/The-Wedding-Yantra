"use client";

import { LOST_LABELS, LOST_REASONS, type LostReason } from "@wedding-yantra/types";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

/** Asks why a lead was lost, so the owner can learn what to change. */
export function LostSheet({
  open,
  onClose,
  onPick,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (reason: LostReason) => void;
  busy?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Why was it lost?" description="This helps you see what to change.">
      <div className="grid gap-2">
        {LOST_REASONS.map((r) => (
          <Button key={r} variant="secondary" size="lg" className="justify-start" onClick={() => onPick(r)} disabled={busy}>
            {LOST_LABELS[r]}
          </Button>
        ))}
      </div>
    </Sheet>
  );
}
