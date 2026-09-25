"use client";

import type { Me, WorkspaceSummary } from "@wedding-yantra/types";
import { createContext, useContext } from "react";

export interface WorkspaceContextValue {
  me: Me;
  workspace: WorkspaceSummary;
  switchTo: (workspaceId: string) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** The signed-in person and the business they are working in right now. */
export function useCurrentWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useCurrentWorkspace must be used inside the /app layout");
  return value;
}
