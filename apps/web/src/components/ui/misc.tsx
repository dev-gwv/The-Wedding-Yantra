import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** White card, warm border, soft warm shadow. The main building block of every screen. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-3xl border border-line bg-surface shadow-soft", className)} {...props} />;
}

/** Small cream label with saffron text, used above page titles. */
export function Eyebrow({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-cream px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-brand-strong ring-1 ring-sun-300/60">
      {Icon && <Icon className="size-3.5 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  action,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-3">{eyebrow}</div>}
        <h1 className="font-display text-[clamp(28px,4vw,38px)] font-extrabold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/** An icon in a cream square with a saffron icon, as on PhotoLancer's stat cards. */
export function IconSquare({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong", className)}>
      <Icon className="size-5" strokeWidth={2} />
    </span>
  );
}

/** An icon on the gradient, for the one card on a screen that asks you to act. */
export function GradientTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-on-brand shadow-soft",
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={2.25} />
    </span>
  );
}

/** Cream-to-white card with a light saffron border: "here is what to do next". */
export function NextStepCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-sun-300/60 bg-gradient-to-br from-cream to-surface shadow-soft",
        className,
      )}
      {...props}
    />
  );
}

/** Cream track, gradient fill. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-sun-100"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-gradient-primary transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** What a screen shows before it has anything in it: one sentence, at most one button. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <IconSquare icon={icon} className="size-14 rounded-2xl [&_svg]:size-6" />
      <h2 className="mt-5 font-display text-xl font-extrabold">{title}</h2>
      {children && <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "success" }) {
  const tones = {
    neutral: "bg-cream text-ink",
    brand: "bg-cream text-brand-strong ring-1 ring-sun-300/60",
    success: "bg-success-soft text-success",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

/** Initials on the gradient, as in PhotoLancer's account button. */
export function Avatar({ name, muted, className }: { name: string | null; muted?: boolean; className?: string }) {
  const initials =
    (name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold",
        muted ? "bg-cream text-ink-muted" : "bg-gradient-primary text-on-brand",
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "danger" }) {
  const tones = {
    neutral: "bg-cream text-ink",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return <div className={cn("rounded-xl px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}
