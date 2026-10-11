import type { IncomingLeadStatus, MetaPage } from "@wedding-yantra/types";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONES: Record<ChipTone, string> = {
  neutral: "bg-cream text-ink-muted",
  brand: "bg-cream text-brand-strong ring-1 ring-sun-300/60",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/** A small status label: "Receiving leads", "Off", "Added". */
export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold", TONES[tone])}>{children}</span>;
}

/** Where a Page stands, in two or three words. */
export function pageChip(page: MetaPage): { label: string; tone: ChipTone } {
  if (!page.active) return { label: "Off", tone: "neutral" };
  switch (page.status) {
    case "ok":
      return { label: "Receiving leads", tone: "success" };
    case "needs_reconnect":
      return { label: "Log in again", tone: "danger" };
    case "lead_access":
      return { label: "Blocked by Facebook", tone: "danger" };
    case "not_subscribed":
      return { label: "Not receiving", tone: "danger" };
    case "permission_missing":
      return { label: "Permission missing", tone: "danger" };
    case "off":
      return { label: "Off", tone: "neutral" };
  }
}

export const INCOMING_STATUS: Record<IncomingLeadStatus, { label: string; tone: ChipTone }> = {
  queued: { label: "Bringing in", tone: "warning" },
  added: { label: "Added", tone: "success" },
  merged: { label: "Added to open enquiry", tone: "brand" },
  skipped: { label: "Skipped", tone: "neutral" },
  failed: { label: "Couldn't bring in", tone: "danger" },
};

/** Failed leads that "Try again" can't bring in: the Page was off, or Meta no longer keeps them. */
export const FINAL_ERROR_KINDS: readonly string[] = ["page_off", "expired"];

/** Why a lead hasn't come in yet, in plain words. `failed`: it isn't being tried again by itself. */
export function errorKindText(kind: string | null, failed = false): string | null {
  switch (kind) {
    case null:
      return null;
    case "token":
      return "Facebook wants you to log in again";
    case "permission":
      return "Facebook didn't allow it";
    case "lead_access":
      return "Blocked by Leads access on Facebook";
    case "rate_limit":
      return "Facebook asked us to wait a little";
    case "not_found":
      return "Facebook couldn't find this lead";
    case "page_off":
      return "The Page was switched off before it came in";
    case "expired":
      return "Waited too long: Facebook keeps leads for 90 days";
    case "no_stages":
      return failed ? "Add a sales stage, then tap Try again" : "Add a sales stage so it can come in";
    case "internal":
      return failed ? "A problem on our side" : "A problem on our side; trying again";
    default:
      return failed ? "Facebook didn't answer" : "Facebook didn't answer; trying again";
  }
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
