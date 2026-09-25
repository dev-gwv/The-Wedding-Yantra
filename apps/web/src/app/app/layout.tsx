"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useMe } from "@wedding-yantra/api-client/react";
import { CloudOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { AppShell } from "@/components/app/app-shell";
import { RequireAuth } from "@/components/app/require-auth";
import { WorkspaceContext } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { setWorkspaceId, useWorkspaceId } from "@/lib/session";

function WorkspaceGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const savedId = useWorkspaceId();
  const router = useRouter();
  const queryClient = useQueryClient();

  const workspaces = me.data?.workspaces;
  const workspace = useMemo(
    () => workspaces?.find((w) => w.id === savedId) ?? workspaces?.[0] ?? null,
    [workspaces, savedId],
  );

  useEffect(() => {
    // Only send people to set up a business when the list is fresh, not a cached old copy.
    if (workspaces && workspaces.length === 0 && !me.isFetching) router.replace("/onboarding");
    else if (workspace && workspace.id !== savedId) setWorkspaceId(workspace.id);
  }, [workspaces, workspace, savedId, router, me.isFetching]);

  if (me.isError) {
    return (
      <EmptyState
        icon={CloudOff}
        title="Can't load your business"
        className="min-h-dvh justify-center"
        action={<Button onClick={() => void me.refetch()}>Try again</Button>}
      >
        {errorMessage(me.error)}
      </EmptyState>
    );
  }
  if (!me.data || !workspace) return <Splash />;

  const switchTo = (id: string) => {
    setWorkspaceId(id);
    void queryClient.invalidateQueries();
    router.push("/app");
  };

  return (
    <WorkspaceContext.Provider value={{ me: me.data, workspace, switchTo }}>
      <AppShell>{children}</AppShell>
    </WorkspaceContext.Provider>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <WorkspaceGate>{children}</WorkspaceGate>
    </RequireAuth>
  );
}
