"use client";

import { can, metaProblemTone } from "@wedding-yantra/core";
import { useMetaStatus } from "@wedding-yantra/api-client/react";
import { CircleAlert, Megaphone } from "lucide-react";
import Link from "next/link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { GradientTile, NextStepCard } from "@/components/ui/misc";
import { useDeviceFlag } from "@/lib/device-flag";
import { APP_GUIDE_PATH, FACEBOOK_SETTINGS_PATH } from "@/lib/facebook-guide";

/** The owner said "Not now" to the Facebook card for this business. Kept on this device. */
const notNowKey = (workspaceId: string) => `wy.fb-card-hidden.${workspaceId}`;

/**
 * At the top of Leads, for the owner: "Get your Facebook & Instagram leads here", with the
 * guide and the connect button, until a Page is sending leads. If a Page that's on needs a
 * fix, a warning instead. Nothing once all is well.
 */
export function FacebookLeadsCard() {
  const { workspace } = useCurrentWorkspace();
  const owner = can(workspace, "members.hr");
  const meta = useMetaStatus(workspace.id, owner);
  const [hidden, hide] = useDeviceFlag(notNowKey(workspace.id));

  if (!owner || !meta.data?.available) return null;

  const active = meta.data.pages.filter((p) => p.active);
  const troubled = active.filter((p) => p.status !== "ok" || p.problems.some((x) => metaProblemTone(x.kind) === "red"));

  if (troubled.length > 0) {
    return (
      <Link
        href={FACEBOOK_SETTINGS_PATH}
        className="mb-6 flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger transition hover:border-danger/60"
      >
        <CircleAlert className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <strong>Facebook leads need a fix</strong> on {troubled.map((p) => p.name).join(", ")}. New leads may not be coming in.
        </span>
        <span className="shrink-0 font-bold underline underline-offset-2">Fix it</span>
      </Link>
    );
  }

  if (active.length > 0 || hidden) return null;

  return (
    <NextStepCard className="mb-6 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <GradientTile icon={Megaphone} />
        <div className="min-w-0">
          <p className="font-display text-lg font-extrabold leading-snug">Get your Facebook & Instagram leads here by themselves</p>
          <p className="mt-0.5 text-sm text-ink-muted">Easy steps, about 10 minutes, once. Each lead goes to a salesperson, with an alert.</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <ButtonLink href={APP_GUIDE_PATH} variant="secondary" size="sm">
          See how
        </ButtonLink>
        <ButtonLink href={FACEBOOK_SETTINGS_PATH} size="sm">
          Connect now
        </ButtonLink>
        <Button
          variant="ghost"
          size="sm"
          onClick={hide}
        >
          Not now
        </Button>
      </div>
    </NextStepCard>
  );
}
