"use client";

import { metaProblemTone } from "@wedding-yantra/core";
import { useLeadRouting, useMetaRecent, useMetaStatus } from "@wedding-yantra/api-client/react";
import type { MetaStatus } from "@wedding-yantra/types";
import { Check, ChevronRight, CircleAlert, Hourglass, Megaphone, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useMetaActions } from "@/components/sales/meta/use-meta-actions";
import { Button } from "@/components/ui/button";
import { GradientTile, Notice, NextStepCard, ProgressBar } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { useDeviceFlag } from "@/lib/device-flag";
import { FACEBOOK_SETTINGS_PATH } from "@/lib/facebook-guide";

/** A test lead once seen stays ticked on this device, after real leads push it off the recent list. */
const testKey = (workspaceId: string) => `wy.fb-test-lead.${workspaceId}`;

interface Step {
  key: string;
  title: string;
  done: boolean;
  hint: string;
  action?: ReactNode;
}

/** For the owner, at the top of the guide in Leads: how far they've got, and the next thing to tap. */
export function FacebookProgress({ workspaceId }: { workspaceId: string }) {
  const status = useMetaStatus(workspaceId);
  const connected = (status.data?.connections.length ?? 0) > 0;
  const recent = useMetaRecent(workspaceId, { enabled: connected });
  const routing = useLeadRouting(workspaceId, connected);
  const actions = useMetaActions(workspaceId);
  const [testedBefore, rememberTested] = useDeviceFlag(testKey(workspaceId));
  const seenTest = !!recent.data?.some((r) => r.isTest && (r.status === "added" || r.status === "merged"));
  useEffect(() => {
    if (seenTest && !testedBefore) rememberTested();
  }, [seenTest, testedBefore, rememberTested]);
  const tested = seenTest || testedBefore;

  if (status.isPending) {
    return (
      <div className="flex justify-center py-8 text-brand">
        <Spinner />
      </div>
    );
  }
  if (status.isError) return null;
  if (!status.data.available) return <NotAvailable reason={status.data.reason} />;

  const data: MetaStatus = status.data;
  const active = data.pages.filter((p) => p.active);
  const hasForm = active.some((p) => p.forms.length > 0);
  const troubled = active.filter((p) => p.status !== "ok" || p.problems.some((x) => metaProblemTone(x.kind) === "red"));

  const steps: Step[] = [
    {
      key: "connect",
      title: "Connect Facebook",
      done: connected,
      hint: "Log in to Facebook and tick your Page.",
      action: (
        <Button size="sm" loading={actions.connecting} onClick={() => void actions.goToFacebook()}>
          Continue with Facebook
        </Button>
      ),
    },
    {
      key: "page",
      title: "Switch on your Page",
      done: active.length > 0,
      hint: "Tick the Page your ads run from and tap “Switch on”.",
      action: <StepLink href={`${FACEBOOK_SETTINGS_PATH}?choose=1`}>Choose your Page</StepLink>,
    },
    {
      key: "form",
      title: "A lead form is found",
      done: hasForm,
      hint: "Make an Instant Form on Facebook, then tap “Check again”.",
      action: (
        <div className="flex flex-wrap gap-2">
          <StepLink href="#step-form">How to make one</StepLink>
          {active[0] && (
            <Button size="sm" variant="secondary" loading={actions.checkingId === active[0].id} onClick={() => void actions.checkPage(active[0]!.id)}>
              Check again
            </Button>
          )}
        </div>
      ),
    },
    {
      key: "test",
      title: "A test lead came in",
      done: tested,
      hint: "Tap “Send a test lead” under your form.",
      action: <StepLink href={FACEBOOK_SETTINGS_PATH}>Send a test lead</StepLink>,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  // Only the first step not done gets its button, so there's one clear next thing.
  const next = steps.find((s) => !s.done);
  const pool = routing.data?.pool ?? [];

  return (
    <NextStepCard className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <GradientTile icon={Megaphone} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-extrabold">{done === steps.length ? "All set: leads come in by themselves" : "Your progress"}</h2>
            <span className="text-sm font-semibold text-ink-muted tabular">
              {done} of {steps.length} done
            </span>
          </div>
          <div className="mt-3">
            <ProgressBar value={(done / steps.length) * 100} label="Facebook setup progress" />
          </div>
        </div>
      </div>

      <ol className="mt-5 space-y-2">
        {steps.map((step, i) => (
          <li key={step.key} className={cn("flex items-start gap-3 rounded-2xl px-4 py-3.5", step === next && "border border-sun-300 bg-surface")}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold",
                step.done ? "bg-success text-on-brand" : "bg-cream text-brand-strong",
              )}
            >
              {step.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-bold", step.done && "text-ink-muted line-through")}>{step.title}</p>
              {!step.done && <p className="mt-0.5 text-sm text-ink-muted">{step.hint}</p>}
              {step === next && step.action && <div className="mt-3">{step.action}</div>}
            </div>
          </li>
        ))}
      </ol>

      {troubled.length > 0 && (
        <div className="mt-4">
          <Notice tone="danger">
            <span className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>Something needs fixing</strong> on {troubled.map((p) => p.name).join(", ")}.{" "}
                <Link href={FACEBOOK_SETTINGS_PATH} className="font-bold underline underline-offset-2">
                  See the steps
                </Link>
              </span>
            </span>
          </Notice>
        </div>
      )}

      {connected && pool.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm text-ink-muted">
          <Users className="size-4 shrink-0" />
          <span>
            Leads go to <strong className="text-ink">{pool.map((p) => p.name ?? "Someone").join(", ")}</strong>, whoever has the fewest open leads first.
          </span>
          <Link href={`${FACEBOOK_SETTINGS_PATH}#who-gets`} className="font-bold text-brand-strong hover:text-brand-deep">
            Change
          </Link>
        </p>
      )}
    </NextStepCard>
  );
}

function StepLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 rounded-xl bg-gradient-primary px-3.5 py-2 text-sm font-bold text-on-brand shadow-soft">
      {children} <ChevronRight className="size-4" />
    </Link>
  );
}

function NotAvailable({ reason }: { reason: MetaStatus["reason"] }) {
  const notSetUp = reason === "not_configured";
  const Icon = notSetUp ? Wrench : Hourglass;
  return (
    <Notice tone="warning">
      <span className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>{notSetUp ? "Connecting Facebook isn't switched on yet." : "Coming soon: Meta is reviewing our app."}</strong> You can do the “Before
          you start” steps below now, so you&apos;re ready.
        </span>
      </span>
    </Notice>
  );
}
