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
import { ACCESS_KEY, CACHE_KEY, setWorkspaceId, useWorkspaceId } from "@/lib/session";

/** What each business let this person do when this device last looked, to notice a screen taken away. */

function savedAccess(): Record<string, string[]> {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(ACCESS_KEY) ?? "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

function WorkspaceGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const savedId = useWorkspaceId();
  const router = useRouter();
  const queryClient = useQueryClient();

  const workspaces = me.data?.workspaces;

  // An alert tapped on the phone names its business (?ws=): open that one.
  useEffect(() => {
    const url = new URL(window.location.href);
    const wanted = url.searchParams.get("ws");
    if (!wanted || !workspaces) return;
    if (workspaces.some((w) => w.id === wanted) && wanted !== savedId) setWorkspaceId(wanted);
    url.searchParams.delete("ws");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [workspaces, savedId]);
  const workspace = useMemo(
    () => workspaces?.find((w) => w.id === savedId) ?? workspaces?.[0] ?? null,
    [workspaces, savedId],
  );

  // When the owner takes a screen away, or someone leaves a business, the copy of that
  // business kept on this device is dropped, so nothing from a lost screen stays on the phone.
  useEffect(() => {
    if (!workspaces) return;
    const before = savedAccess();
    const now: Record<string, string[]> = Object.fromEntries(workspaces.map((w) => [w.id, [...w.permissions]]));
    const lost = Object.keys(before).filter((id) => Array.isArray(before[id]) && before[id].some((p) => !now[id]?.includes(p)));
    for (const id of lost) {
      queryClient.removeQueries({ queryKey: ["workspace", id], type: "inactive" });
      // Screens open right now forget what they showed and ask again.
      void queryClient.resetQueries({ queryKey: ["workspace", id], type: "active" });
    }
    try {
      // The saved copy is written again, without the dropped business, a moment later.
      if (lost.length) window.localStorage.removeItem(CACHE_KEY);
      window.localStorage.setItem(ACCESS_KEY, JSON.stringify(now));
    } catch {
      // Storage blocked: nothing was kept to drop.
    }
  }, [workspaces, queryClient]);

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
