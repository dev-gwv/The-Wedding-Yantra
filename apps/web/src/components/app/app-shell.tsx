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
  if (href === "/app/more") return ["/app/more", "/app/team", "/app/settings"].some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { workspace } = useCurrentWorkspace();

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-5 pb-4 pt-6">
          <Logo />
        </div>
        <Link
          href="/app/more"
          className="mx-3 mb-4 flex items-center gap-3 rounded-md border border-line px-3 py-2.5 hover:bg-surface-muted"
        >
          <span className="grid size-8 place-items-center rounded-md bg-brand-soft text-brand">
            <BusinessIcon name={workspace.businessTypeIcon} className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{workspace.name}</span>
            <span className="block truncate text-xs text-ink-muted">{workspace.businessTypeName}</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                  active ? "bg-brand-soft text-brand-strong" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                <Icon className="size-[18px]" strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-10">{children}</main>

      {/* Phone bottom tabs */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                    active ? "text-brand" : "text-ink-muted",
                  )}
                >
                  <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 1.75} />
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
