"use client";

import { can, timeAgo } from "@wedding-yantra/core";
import { useMetaStatus } from "@wedding-yantra/api-client/react";
import type { MetaStatus } from "@wedding-yantra/types";
import { CloudOff, Hourglass, Info, Lock, LogIn, Megaphone, Wrench } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { ChoosePages } from "@/components/sales/meta/choose-pages";
import { ConnectCard } from "@/components/sales/meta/connect-card";
import { DisconnectCard } from "@/components/sales/meta/disconnect-card";
import { OtherPages, PageCard } from "@/components/sales/meta/page-card";
import { ProblemBox } from "@/components/sales/meta/problem-box";
import { RecentList } from "@/components/sales/meta/recent-list";
import { RoutingPicker } from "@/components/sales/meta/routing-picker";
import { useMetaActions, type MetaActions } from "@/components/sales/meta/use-meta-actions";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

const PATH = "/app/settings/facebook-leads";

function Notes() {
  return (
    <div className="space-y-2">
      <Notice>
        <strong>Instagram ads:</strong> pick the Facebook Page your Instagram account is linked to.
      </Notice>
      <p className="flex gap-2 px-1 text-sm text-ink-muted">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Only lead form (Instant Form) ads come in here. Click-to-WhatsApp, Messenger and website ads don&apos;t, so keep answering those as before.
        </span>
      </p>
    </div>
  );
}

function Connected({
  workspaceId,
  data,
  actions,
  choosing,
  onChosen,
}: {
  workspaceId: string;
  data: MetaStatus;
  actions: MetaActions;
  choosing: boolean;
  onChosen: () => void;
}) {
  const who = data.connections.find((c) => c.fbUserName)?.fbUserName ?? null;
  // Pages sending leads, or with something to fix, get a full card; the rest sit in a short list.
  const shown = data.pages.filter((p) => p.active || p.problems.length > 0);
  const others = data.pages.filter((p) => !p.active && p.problems.length === 0);
  const choose = choosing && others.length > 0;

  return (
    <div className="space-y-6">
      {data.mode === "fake" && <Notice tone="warning">Test mode: this server uses a stand-in for Facebook. No real leads come in.</Notice>}

      {data.problems.map((p) => (
        <ProblemBox key={p.kind} problem={p} who={who} actions={actions} />
      ))}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm text-ink-muted">
        <span className="min-w-0 flex-1">
          {data.connections.map((c) => (
            <span key={c.id} className="block">
              Connected{c.fbUserName ? ` as ${c.fbUserName}` : ""} {timeAgo(c.connectedAt)}
              {c.connectedByName && c.connectedByName !== c.fbUserName ? ` by ${c.connectedByName}` : ""}
            </span>
          ))}
        </span>
        <Button size="sm" variant="ghost" className="-mr-2" loading={actions.connecting} onClick={() => void actions.goToFacebook(true)}>
          <LogIn className="size-4" /> Add another Page
        </Button>
      </div>

      {choose && <ChoosePages workspaceId={workspaceId} pages={others} onDone={onChosen} />}

      {data.pages.length === 0 && (
        <Card>
          <EmptyState
            icon={Megaphone}
            title="No Pages yet"
            action={
              <Button loading={actions.connecting} onClick={() => void actions.goToFacebook(true)}>
                <LogIn className="size-4" /> Reconnect
              </Button>
            }
          >
            Facebook didn&apos;t share any Pages. Tap Reconnect and tick the Page your lead ads run from.
          </EmptyState>
        </Card>
      )}

      {shown.map((page) => (
        <PageCard key={page.id} workspaceId={workspaceId} page={page} who={who} actions={actions} />
      ))}

      {!choose && <OtherPages workspaceId={workspaceId} pages={others} />}

      <Notes />
      <RoutingPicker workspaceId={workspaceId} />
      <RecentList workspaceId={workspaceId} pages={data.pages} actions={actions} />
      <DisconnectCard workspaceId={workspaceId} />
    </div>
  );
}

function FacebookLeads() {
  const { workspace } = useCurrentWorkspace();
  const owner = can(workspace, "members.hr");
  const status = useMetaStatus(workspace.id, owner);
  const actions = useMetaActions(workspace.id);
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const greeted = useRef(false);
  const [chosen, setChosen] = useState(false);

  // Back from Facebook: say so once, and keep "connected" out of the address bar.
  useEffect(() => {
    if (params.get("connected") !== "1" || greeted.current) return;
    greeted.current = true;
    toast("Facebook connected");
    router.replace(params.get("choose") === "1" ? `${PATH}?choose=1` : PATH);
  }, [params, router, toast]);

  const header = (
    <>
      <BackLink href="/app/settings" label="Settings" />
      <PageHeader title="Facebook & Instagram leads" subtitle="Leads from your Facebook and Instagram forms, straight into Leads." />
    </>
  );

  if (!owner) {
    return (
      <>
        {header}
        <Card>
          <EmptyState icon={Lock} title="Only the owner connects Facebook">
            Ask the owner to connect your Facebook Page here. Its leads then arrive in Leads by themselves.
          </EmptyState>
        </Card>
      </>
    );
  }

  let body;
  if (status.isPending) {
    body = (
      <div className="flex justify-center py-16 text-brand">
        <Spinner />
      </div>
    );
  } else if (status.isError) {
    body = (
      <Card>
        <EmptyState icon={CloudOff} title="Can't load this" action={<Button onClick={() => void status.refetch()}>Try again</Button>}>
          {errorMessage(status.error)}
        </EmptyState>
      </Card>
    );
  } else if (!status.data.available) {
    body =
      status.data.reason === "not_configured" ? (
        <Card>
          <EmptyState icon={Wrench} title="Not set up on this server yet">
            Facebook lead ads need a one-time setup on the server before you can connect.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <EmptyState icon={Hourglass} title="Coming soon: Meta is reviewing our app">
            Once Meta approves it, you can connect your Facebook Page here and its leads arrive in Leads by themselves.
          </EmptyState>
        </Card>
      );
  } else if (status.data.connections.length === 0) {
    body = (
      <div className="space-y-6">
        <ConnectCard actions={actions} />
        <Notes />
      </div>
    );
  } else {
    const noneOn = !status.data.pages.some((p) => p.active);
    body = (
      <Connected
        workspaceId={workspace.id}
        data={status.data}
        actions={actions}
        choosing={!chosen && (params.get("choose") === "1" || noneOn)}
        onChosen={() => {
          setChosen(true);
          if (params.get("choose")) router.replace(PATH);
        }}
      />
    );
  }

  return (
    <>
      {header}
      {body}
    </>
  );
}

export default function FacebookLeadsPage() {
  return (
    <Suspense fallback={<Splash />}>
      <FacebookLeads />
    </Suspense>
  );
}
