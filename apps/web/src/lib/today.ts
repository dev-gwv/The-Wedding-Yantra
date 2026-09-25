"use client";

import { todayIn } from "@wedding-yantra/core";
import { useCurrentWorkspace } from "@/components/app/workspace-context";

/**
 * A day counted in the business's time zone, the same way the API counts it, so "today"
 * and "late" agree with the server whatever the device's clock says. `days` moves it.
 */
export function useBusinessDay(): (days?: number) => string {
  const { workspace } = useCurrentWorkspace();
  return (days = 0) => todayIn(workspace.timezone, new Date(), days);
}
