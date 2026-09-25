"use client";

import { CalendarDays, House, IndianRupee, Inbox, Menu, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BusinessIcon } from "./business-icon";
import { Logo } from "./logo";
import { useCurrentWorkspace } from "./workspace-context";

/** Five places, never more. The same five will be the tabs of the mobile app. */
const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/app", label: "Home", icon: House },
  { href: "/app/leads", label: "Leads", icon: Inbox },
  { href: "/app/events", label: "Events", icon: CalendarDays },
  { href: "/app/money", label: "Money", icon: IndianRupee },
  { href: "/app/more", label: "More", icon: Menu },
];

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  if (href === "/app/more") return ["/app/more", "/app/team", "/app/settings", "/app/clients", "/app/expenses", "/app/tasks", "/app/time-off", "/app/scores", "/app/activity", "/app/summary", "/app/billing"].some((p) => pathname.startsWith(p));
  if (href === "/app/money") return ["/app/money", "/app/quotes", "/app/bills", "/app/reports"].some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { workspace } = useCurrentWorkspace();

  return (
    <div className="min-h-dvh bg-surface lg:pl-72 print:pl-0">
      {/* Desktop: a floating white panel, like PhotoLancer's studio menu */}
      <aside className="fixed inset-y-4 left-4 hidden w-60 print:!hidden flex-col rounded-3xl border border-line bg-surface p-3 shadow-soft lg:flex">
        <div className="px-2 pb-5 pt-3">
          <Logo className="[&_svg]:size-9 [&>span:last-child]:text-lg" />
        </div>
        <Link
          href="/app/more"
          className="mb-4 flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5 transition hover:bg-sun-100"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-brand-strong shadow-soft">
            <BusinessIcon name={workspace.businessTypeIcon} className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{workspace.name}</span>
            <span className="block truncate text-xs text-ink-muted">{workspace.businessTypeName}</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition",
                  active
                    ? "bg-gradient-primary text-on-brand shadow-warm"
                    : "text-ink-muted hover:bg-cream hover:text-brand-strong",
                )}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10 print:max-w-none print:p-0">{children}</main>

      {/* Phone: white tab bar; the active icon sits in a small gradient pill */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden print:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5 pt-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 pb-1 text-[11px]",
                    active ? "font-bold text-brand-strong" : "font-semibold text-ink-muted",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-8 w-12 place-items-center rounded-full transition",
                      active && "bg-gradient-primary text-on-brand shadow-soft",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={2} />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
