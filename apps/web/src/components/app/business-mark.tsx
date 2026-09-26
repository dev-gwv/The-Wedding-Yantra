"use client";

import { useApi } from "@wedding-yantra/api-client/react";
import { cn } from "@/lib/cn";
import { BusinessIcon } from "./business-icon";

const SIZES = {
  sm: { box: "size-9 rounded-xl", icon: "size-4" },
  md: { box: "size-12 rounded-2xl", icon: "size-6" },
  lg: { box: "size-14 rounded-2xl", icon: "size-7" },
  xl: { box: "size-20 rounded-3xl", icon: "size-9" },
} as const;

const TONES = {
  gradient: "bg-gradient-primary text-on-brand shadow-soft print:shadow-none",
  cream: "bg-cream text-brand-strong",
  surface: "bg-surface text-brand-strong shadow-soft",
} as const;

/** The business's logo when it has one; otherwise its trade's icon on a tile. */
export function BusinessMark({
  logoUrl,
  icon,
  name,
  size = "md",
  tone = "gradient",
  className,
}: {
  logoUrl: string | null | undefined;
  icon: string;
  name?: string;
  size?: keyof typeof SIZES;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  const api = useApi();
  const s = SIZES[size];
  if (logoUrl) {
    return (
      <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-surface ring-1 ring-line", s.box, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the API, already small */}
        <img src={api.fileUrl(logoUrl)} alt={name ? `${name} logo` : "Logo"} className="size-full object-contain p-1" />
      </span>
    );
  }
  return (
    <span className={cn("grid shrink-0 place-items-center", s.box, TONES[tone], className)}>
      <BusinessIcon name={icon} className={s.icon} />
    </span>
  );
}
