"use client";

import { metaProblemTone } from "@wedding-yantra/core";
import { useCheckMetaPage, useMetaConnect } from "@wedding-yantra/api-client/react";
import type { MetaCheckResult } from "@wedding-yantra/types";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";
import { plural } from "./chips";
import { clearReturn } from "./return-stash";

export interface MetaActions {
  /** Sends the whole page to Facebook's login (no popup: phone browsers block them). */
  goToFacebook: (reconnect?: boolean) => Promise<void>;
  connecting: boolean;
  /** "Check again" (and "Try again" for leads that couldn't be brought in) */
  checkPage: (id: string) => Promise<void>;
  /** The Page being checked right now */
  checkingId: string | null;
}

function checkedText(page: MetaCheckResult): string {
  if (page.recovered > 0) return `Brought in ${plural(page.recovered, "lead")} that had been missed`;
  if (page.status === "ok" && !page.problems.some((p) => metaProblemTone(p.kind) === "red")) return "All good: leads are coming in";
  return "Still not fixed. Follow the steps shown.";
}

/** The two things several parts of the Facebook screen do: log in to Facebook, and check a Page. */
export function useMetaActions(workspaceId: string): MetaActions {
  const connect = useMetaConnect(workspaceId);
  const check = useCheckMetaPage(workspaceId);
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);

  // Back from Facebook with the browser's back button: the page comes back as it was left.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) setLeaving(false);
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);

  async function goToFacebook(reconnect = false) {
    try {
      const { url } = await connect.mutateAsync(reconnect ? { reconnect: true } : {});
      setLeaving(true);
      clearReturn();
      window.location.assign(url);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function checkPage(id: string) {
    try {
      toast(checkedText(await check.mutateAsync(id)));
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return {
    goToFacebook,
    connecting: connect.isPending || leaving,
    checkPage,
    checkingId: check.isPending ? (check.variables ?? null) : null,
  };
}
