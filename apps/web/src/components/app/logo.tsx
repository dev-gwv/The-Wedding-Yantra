import { useId } from "react";
import { cn } from "@/lib/cn";

/** The Wedding Yantra mark: an eight-petal marigold on the sunrise gradient. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={cn("size-10 drop-shadow-[0_6px_12px_rgba(150,90,20,0.18)]", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF7A1A" />
          <stop offset="1" stopColor="#FFB020" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <g fill="#FFFFFF">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <ellipse key={deg} cx="16" cy="9.8" rx="2.5" ry="4.4" transform={`rotate(${deg} 16 16)`} opacity="0.96" />
        ))}
      </g>
      <circle cx="16" cy="16" r="3" fill="#FF8A2B" />
      <circle cx="16" cy="16" r="1.4" fill="#FFFFFF" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[22px] font-extrabold tracking-tight text-ink">Wedding Yantra</span>
    </span>
  );
}
