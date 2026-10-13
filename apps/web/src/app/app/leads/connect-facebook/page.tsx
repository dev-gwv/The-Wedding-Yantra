"use client";

import { can } from "@wedding-yantra/core";
import { Lock } from "lucide-react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { FacebookGuide } from "@/components/guides/facebook-guide";
import { FacebookProgress } from "@/components/guides/facebook-progress";
import { ShareGuide } from "@/components/guides/share-guide";
import { Notice, PageHeader } from "@/components/ui/misc";
import { GUIDE_INTRO, guideVideo } from "@/lib/facebook-guide";

/**
 * Leads → "Connect Facebook & Instagram": the step-by-step guide, with the owner's progress on
 * top. Anyone can read it; only the owner can connect.
 */
export default function ConnectFacebookGuidePage() {
  const { workspace } = useCurrentWorkspace();
  const owner = can(workspace, "members.hr");
  return (
    <>
      <BackLink href="/app/leads" label="Leads" />
      <PageHeader title="Connect Facebook & Instagram" subtitle={GUIDE_INTRO.join(" ")} />
      <div className="space-y-8">
        {owner ? (
          <FacebookProgress workspaceId={workspace.id} />
        ) : (
          <Notice>
            <span className="flex items-start gap-2">
              <Lock className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>Only the business owner can connect Facebook.</strong> Show them this page, or send it to them.
              </span>
            </span>
          </Notice>
        )}
        <FacebookGuide
          mode="app"
          video={guideVideo()}
          share={<ShareGuide note={owner ? undefined : "Send this guide to your owner, or to whoever runs your Facebook ads."} />}
        />
      </div>
    </>
  );
}
