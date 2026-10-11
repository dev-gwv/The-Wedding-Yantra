import { SOURCE_LABELS, type LeadSource } from "@wedding-yantra/types";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/cn";

export type AdSource = Extract<LeadSource, "facebook_ad" | "instagram_ad">;

/** Came in by itself from a Facebook or Instagram lead form. */
export const isAdSource = (source: LeadSource): source is AdSource => source === "facebook_ad" || source === "instagram_ad";

/** "Facebook ad" or "Instagram ad" on a lead its lead form brought in; nothing for other sources. */
export function SourceBadge({ source, className }: { source: LeadSource; className?: string }) {
  if (!isAdSource(source)) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-sun-100 px-2.5 py-1 text-xs font-semibold text-brand-deep", className)}>
      <Megaphone className="size-3.5" /> {SOURCE_LABELS[source]}
    </span>
  );
}
