"use client";

import { useQueryClient } from "@tanstack/react-query";
import { queryKeys, useUnreadAlerts } from "@wedding-yantra/api-client/react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useCurrentWorkspace } from "./workspace-context";

/** The bell: unread alerts, checked every minute and the moment a push arrives. */
export function AlertBell({ className, label }: { className?: string; label?: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const unread = useUnreadAlerts(workspace.id).data?.unread ?? 0;
  const qc = useQueryClient();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === "wy-alert") void qc.invalidateQueries({ queryKey: queryKeys.alerts(workspace.id) });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [qc, workspace.id]);

  const count = unread > 99 ? "99+" : String(unread);
  return (
    <Link
      href="/app/notifications"
      aria-label={unread ? `Alerts, ${unread} unread` : "Alerts"}
      className={cn("relative inline-flex items-center gap-3 transition", className)}
    >
      <span className="relative grid place-items-center">
        <Bell className="size-5" strokeWidth={2} />
        {unread > 0 && (
          <span className="absolute -right-2 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white tabular">
            {count}
          </span>
        )}
      </span>
      {label && <span>Alerts</span>}
    </Link>
  );
}
