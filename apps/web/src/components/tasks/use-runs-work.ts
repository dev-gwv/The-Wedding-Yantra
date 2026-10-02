"use client";

import { teamScope } from "@wedding-yantra/core";
import { useTeam } from "@wedding-yantra/api-client/react";
import { useCallback } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";

/** Whether the signed-in person runs this person's work. */
export type RunsWorkOf = (userId: string | null | undefined) => boolean;

/**
 * Whether the signed-in person runs someone's work: gives them tasks and checks them. The
 * owner and managers of the whole team run everyone's; a department's manager runs the work
 * of the people in it, and their own; everyone else only their own. Same rule as the API.
 */
export function useRunsWorkOf(): RunsWorkOf {
  const { workspace, me } = useCurrentWorkspace();
  const scope = teamScope(workspace);
  // Only a department's manager needs the team list, to see who is in their department.
  const team = useTeam(scope === "department" ? workspace.id : null);
  const members = team.data?.members;
  const department = workspace.department;
  const myId = me.user.id;

  return useCallback(
    (userId: string | null | undefined) => {
      if (scope === "all") return true;
      if (!userId) return false;
      if (userId === myId) return true;
      if (scope === "self" || !department) return false;
      return !!members?.some((m) => m.userId === userId && m.department === department);
    },
    [scope, members, department, myId],
  );
}
