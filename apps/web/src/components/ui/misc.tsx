import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-medium tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/** What a screen shows before it has anything in it: one sentence, at most one button. */
export function EmptyState({
  icon: Icon,
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
      <div className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon className="size-6" strokeWidth={1.75} />
      </div>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      {children && <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "success" }) {
  const tones = {
    neutral: "bg-surface-muted text-ink-muted",
    brand: "bg-brand-soft text-brand-strong",
    success: "bg-success-soft text-success",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Avatar({ name, className }: { name: string | null; className?: string }) {
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
        "grid size-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-strong",
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
    neutral: "bg-surface-muted text-ink",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return <div className={cn("rounded-md px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}
