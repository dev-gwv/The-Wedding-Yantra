"use client";

import { timeAgo } from "@wedding-yantra/core";
import { ApiRequestError } from "@wedding-yantra/api-client";
import { useUpdateMetaPage } from "@wedding-yantra/api-client/react";
import type { MetaPage } from "@wedding-yantra/types";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";
import { Chip, pageChip } from "./chips";
import { FormList } from "./form-list";
import { ProblemBox } from "./problem-box";
import type { MetaActions } from "./use-meta-actions";

/** "Last lead 2 hours ago · 14 this week" */
export function leadLine(page: MetaPage): string {
  const last = page.lastLeadAt ? `Last lead ${timeAgo(page.lastLeadAt)}` : "No leads yet";
  return page.lastLeadAt || page.leadsThisWeek ? `${last} · ${page.leadsThisWeek} this week` : last;
}

/**
 * Switches a Page's leads on or off. Off asks first, and so does moving a Page another
 * business on Wedding Yantra gets the leads of: it is never moved by a plain "on".
 */
function usePageSwitch(workspaceId: string, page: MetaPage) {
  const update = useUpdateMetaPage(workspaceId);
  const toast = useToast();
  const [asking, setAsking] = useState<"off" | "move" | null>(null);
  // Whether this person may move it; the server says again if it finds the Page taken.
  const [canMove, setCanMove] = useState(page.canManage);
  const [error, setError] = useState<string | null>(null);

  async function set(on: boolean, takeOver = false) {
    setError(null);
    try {
      await update.mutateAsync({ id: page.id, on, takeOver });
      setAsking(null);
      toast(on ? `Leads from ${page.name} now come in here` : `Leads from ${page.name} switched off`);
    } catch (err) {
      if (on && !takeOver && err instanceof ApiRequestError && err.code === "PAGE_IN_OTHER_BUSINESS") {
        // Another business switched it on meanwhile: ask before moving it.
        setCanMove(err.fields.canManage === "yes");
        setAsking("move");
        return;
      }
      setAsking(null);
      setError(errorMessage(err));
    }
  }

  function onChange(on: boolean) {
    if (!on) setAsking("off");
    else if (page.inOtherBusiness) {
      setCanMove(page.canManage);
      setAsking("move");
    } else void set(true);
  }

  const sheet = (
    <>
      <Sheet open={asking === "off"} onClose={() => setAsking(null)} title={`Switch off ${page.name}?`}>
        <p className="text-[15px] text-ink-muted">
          New leads from this Page stop coming in. Leads already in Wedding Yantra stay. You can switch it on again any time.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="destructive" loading={update.isPending} onClick={() => void set(false)}>
            Switch off
          </Button>
          <Button variant="secondary" onClick={() => setAsking(null)}>
            Keep it on
          </Button>
        </div>
      </Sheet>
      <Sheet open={asking === "move"} onClose={() => setAsking(null)} title={`Move ${page.name} here?`}>
        <p className="text-[15px] text-ink-muted">
          {canMove
            ? "This Page sends its leads to another business on Wedding Yantra. Move it here? Its new leads then come here instead, and that business is told."
            : "This Page sends its leads to another business on Wedding Yantra. Only someone with full control of the Page on Facebook can move it here."}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {canMove && (
            <Button loading={update.isPending} onClick={() => void set(true, true)}>
              Move it here
            </Button>
          )}
          <Button variant="secondary" onClick={() => setAsking(null)}>
            {canMove ? "Leave it" : "OK"}
          </Button>
        </div>
      </Sheet>
    </>
  );

  return { onChange, busy: update.isPending, error, sheet };
}

/** A Page sending its leads here (or one with a problem): status, problems, forms and tests. */
export function PageCard({ workspaceId, page, who, actions }: { workspaceId: string; page: MetaPage; who: string | null; actions: MetaActions }) {
  const toggle = usePageSwitch(workspaceId, page);
  const chip = pageChip(page);
  const blocked = !page.active && !page.canAdvertise;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words font-display text-lg font-extrabold">{page.name}</h2>
            <Chip tone={chip.tone}>{chip.label}</Chip>
          </div>
          <p className="mt-0.5 text-sm text-ink-muted">{page.active ? leadLine(page) : page.inOtherBusiness ? "Another business on Wedding Yantra gets its leads" : "Leads from this Page don't come here"}</p>
        </div>
        <Switch checked={page.active} onChange={toggle.onChange} disabled={toggle.busy || blocked} label={`Leads from ${page.name}`} />
      </div>
      {blocked && <p className="text-sm text-ink-muted">You need access to make ads on this Page to switch it on.</p>}
      {toggle.error && <Notice tone="danger">{toggle.error}</Notice>}

      {page.problems.map((p) => (
        <ProblemBox key={p.kind} problem={p} pageId={page.id} pageName={page.name} who={who} actions={actions} />
      ))}

      {page.active && <FormList workspaceId={workspaceId} page={page} />}

      {/* A problem box has its own button. */}
      {page.active && page.problems.length === 0 && (
        <Button size="sm" variant="ghost" className="-ml-2" loading={actions.checkingId === page.id} onClick={() => void actions.checkPage(page.id)}>
          <RefreshCw className="size-4" /> Check again
        </Button>
      )}
      {toggle.sheet}
    </Card>
  );
}

/** The other Pages the Facebook login can see, each one tap from sending its leads here. */
export function OtherPages({ workspaceId, pages }: { workspaceId: string; pages: MetaPage[] }) {
  if (!pages.length) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">Other Pages</h2>
      <Card className="divide-y divide-line overflow-hidden">
        {pages.map((page) => (
          <OtherPageRow key={page.id} workspaceId={workspaceId} page={page} />
        ))}
      </Card>
    </section>
  );
}

function OtherPageRow({ workspaceId, page }: { workspaceId: string; page: MetaPage }) {
  const toggle = usePageSwitch(workspaceId, page);
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold">{page.name}</p>
          <p className="text-sm text-ink-muted">
            {!page.canAdvertise ? "You can't make ads on this Page" : page.inOtherBusiness ? "Another business on Wedding Yantra gets its leads" : "Off"}
          </p>
        </div>
        <Switch checked={page.active} onChange={toggle.onChange} disabled={toggle.busy || !page.canAdvertise} label={`Leads from ${page.name}`} />
      </div>
      {toggle.error && (
        <div className="mt-2">
          <Notice tone="danger">{toggle.error}</Notice>
        </div>
      )}
      {toggle.sheet}
    </div>
  );
}
