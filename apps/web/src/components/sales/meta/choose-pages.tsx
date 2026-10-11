"use client";

import { useUpdateMetaPage } from "@wedding-yantra/api-client/react";
import type { MetaPage } from "@wedding-yantra/types";
import { Check, ListChecks } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, IconSquare, NextStepCard, Notice } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { plural } from "./chips";

/**
 * Right after connecting with several Pages, or while none is switched on: every Page the
 * owner can make ads on, all ticked, switched on in one tap. A Page another business gets the
 * leads of is never in that tap: moving it is asked for on its own switch below.
 */
export function ChoosePages({ workspaceId, pages, onDone }: { workspaceId: string; pages: MetaPage[]; onDone: () => void }) {
  const update = useUpdateMetaPage(workspaceId);
  const toast = useToast();
  const pickable = (p: MetaPage) => p.canAdvertise && !p.inOtherBusiness;
  const [picked, setPicked] = useState<string[]>(() => pages.filter(pickable).map((p) => p.id));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const flip = (id: string, on: boolean) => setPicked((all) => (on ? [...all, id] : all.filter((x) => x !== id)));

  async function switchOn() {
    setBusy(true);
    const failed: Record<string, string> = {};
    let done = 0;
    // One at a time: each one checks Facebook, and a Page used by another business may refuse.
    for (const id of picked) {
      try {
        await update.mutateAsync({ id, on: true });
        done += 1;
      } catch (err) {
        failed[id] = errorMessage(err);
      }
    }
    setBusy(false);
    setErrors(failed);
    setPicked(Object.keys(failed));
    if (done) toast(`${plural(done, "Page")} switched on`);
    if (!Object.keys(failed).length) onDone();
  }

  return (
    <NextStepCard className="p-5">
      <div className="flex items-start gap-3">
        <IconSquare icon={ListChecks} />
        <div className="min-w-0">
          <h2 className="font-display text-lg font-extrabold">Which Pages run your lead ads?</h2>
          <p className="mt-0.5 text-sm text-ink-muted">Leads from the ticked Pages come in here.</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1">
        {pages.map((page) => {
          const on = picked.includes(page.id);
          return (
            <li key={page.id}>
              <label className={cn("flex items-center gap-3 rounded-2xl px-2 py-2", pickable(page) ? "cursor-pointer" : "opacity-60", on && "bg-surface")}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!pickable(page) || busy}
                  onChange={(e) => flip(page.id, e.target.checked)}
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
                <Avatar name={page.name} muted={!on} className="size-9 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-semibold">{page.name}</span>
                  {!page.canAdvertise ? (
                    <span className="block text-xs text-ink-muted">You can&apos;t make ads on this Page</span>
                  ) : (
                    page.inOtherBusiness && (
                      <span className="block text-xs text-ink-muted">Another business on Wedding Yantra gets its leads now. Move it here from Other Pages.</span>
                    )
                  )}
                </span>
              </label>
              {errors[page.id] && (
                <div className="mb-2 mt-1">
                  <Notice tone="danger">{errors[page.id]}</Notice>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button loading={busy} disabled={!picked.length} onClick={() => void switchOn()}>
          {picked.length ? `Switch on ${plural(picked.length, "Page")}` : "Tick a Page"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onDone}>
          Not now
        </Button>
      </div>
    </NextStepCard>
  );
}
