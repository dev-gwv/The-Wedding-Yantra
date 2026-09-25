import { cn } from "@/lib/cn";

/** The Wedding Yantra mark: an eight-petal marigold, which is also a simple yantra. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <g className="fill-on-brand">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <ellipse key={deg} cx="16" cy="9.6" rx="2.6" ry="4.6" transform={`rotate(${deg} 16 16)`} opacity="0.95" />
        ))}
      </g>
      <circle cx="16" cy="16" r="3.1" className="fill-brand" />
      <circle cx="16" cy="16" r="1.5" className="fill-on-brand" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-xl font-medium tracking-tight">Wedding Yantra</span>
    </span>
  );
}
