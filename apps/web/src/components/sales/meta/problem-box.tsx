"use client";

import { metaAdminMessage, metaProblemTone, whatsappLink, type MetaProblemKind } from "@wedding-yantra/core";
import type { MetaProblem } from "@wedding-yantra/types";
import { CircleAlert, LogIn, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { MetaActions } from "./use-meta-actions";

/** Problems the owner fixes by logging in to Facebook again. */
const RECONNECT: readonly MetaProblemKind[] = ["needs_reconnect", "not_subscribed", "permission_missing", "reconnect_soon", "connector_left"];
/** Problems "Check again" can clear once the fix is done (or that it can retry). */
const CHECK: readonly MetaProblemKind[] = ["needs_reconnect", "lead_access", "not_subscribed", "quiet", "failed_leads"];

/**
 * Something wrong with a Page or the connection: red when leads have stopped, amber when they
 * still arrive. The exact steps to fix it, Facebook's own words, and the buttons the steps name.
 */
export function ProblemBox({
  problem,
  pageId,
  pageName,
  who,
  actions,
}: {
  problem: MetaProblem;
  /** The Page it's about; none for the whole connection */
  pageId?: string;
  pageName?: string | null;
  /** The Facebook name of whoever connected, for the admin's steps */
  who?: string | null;
  actions: MetaActions;
}) {
  const red = metaProblemTone(problem.kind) === "red";
  const Icon = red ? CircleAlert : TriangleAlert;
  const admin = metaAdminMessage(problem.kind, { pageName, who });
  const canCheck = !!pageId && CHECK.includes(problem.kind);
  const canReconnect = RECONNECT.includes(problem.kind);
  const checking = !!pageId && actions.checkingId === pageId;

  return (
    <div className={cn("rounded-2xl p-4", red ? "bg-danger-soft" : "bg-warning-soft")}>
      <p className={cn("flex items-start gap-2 font-bold", red ? "text-danger" : "text-warning")}>
        <Icon className="mt-0.5 size-4 shrink-0" />
        {problem.title}
      </p>
      <ol className="mt-3 space-y-2 text-sm text-ink">
        {problem.steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold tabular">{i + 1}</span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
      {problem.metaSays && (
        <p className="mt-3 rounded-xl bg-surface/70 px-3 py-2 text-sm text-ink-muted">
          <span className="font-semibold text-ink">Facebook says:</span> &ldquo;{problem.metaSays}&rdquo;
        </p>
      )}
      {(canCheck || canReconnect || admin) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {canCheck && (
            <Button size="sm" variant={canReconnect ? "secondary" : "primary"} loading={checking} onClick={() => void actions.checkPage(pageId)}>
              <RefreshCw className="size-4" /> {problem.kind === "failed_leads" ? "Try again" : "Check again"}
            </Button>
          )}
          {canReconnect && (
            <Button size="sm" loading={actions.connecting} onClick={() => void actions.goToFacebook(true)}>
              <LogIn className="size-4" /> Reconnect
            </Button>
          )}
          {admin && (
            <a
              href={whatsappLink(admin)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: "secondary", size: "sm", className: "h-auto min-h-9 whitespace-normal py-2 text-left" })}
            >
              <MessageCircle className="size-4" /> Send these steps to your Facebook admin
            </a>
          )}
        </div>
      )}
    </div>
  );
}
