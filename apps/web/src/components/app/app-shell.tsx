"use client";

import { can, eventScope, leadScope, type Access } from "@wedding-yantra/core";
import { CalendarDays, ChevronDown, ClipboardList, Database, FileText, House, IndianRupee, Inbox, Menu, Sun, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState, type ReactNode } from "react";
import { moneySectionOf, moneySections } from "@/components/money/money-page";
import { inMasterData, masterSectionOf, masterSections } from "./master-sections";
import { taskSectionOf, taskSections } from "./task-sections";
import { cn } from "@/lib/cn";
import { AlertBell } from "./alert-bell";
import { BusinessMark } from "./business-mark";
import { Logo } from "./logo";
import { useCurrentWorkspace } from "./workspace-context";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** On the phone's tab bar, where space is short */
  short?: string;
  /** Who gets it; everyone when left out. Each person sees only the screens they can open. */
  show?: (who: Access) => boolean;
}

/**
 * Five places on the phone, never more. The same five will be the tabs of the mobile app.
 * Each person gets only the ones they can open.
 */
const NAV: NavItem[] = [
  { href: "/app", label: "Home", icon: House },
  { href: "/app/leads", label: "Leads", icon: Inbox, show: (who) => leadScope(who) !== "none" },
  // Quotes without the money: Quotes is all they'd find under Payments and invoices. Sales
  // quotes all day, so it gets a tab on the phone too.
  { href: "/app/money/quotes", label: "Quotes", icon: FileText, show: (who) => can(who, "quotes.view") && !can(who, "finance.view") },
  { href: "/app/events", label: "Events", icon: CalendarDays, show: (who) => eventScope(who) !== "none" },
  { href: "/app/money", label: "Payments and invoices", short: "Payments", icon: IndianRupee, show: (who) => can(who, "finance.view") },
  { href: "/app/more", label: "More", icon: Menu },
];

/** The tab-bar columns for each number of tabs, written out so the styles are kept. */
const TAB_COLUMNS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4", "grid-cols-5"];

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  if (href === "/app/more") return ["/app/more", "/app/masters", "/app/team", "/app/departments", "/app/settings", "/app/my-day", "/app/notifications", "/app/clients", "/app/expenses", "/app/tasks", "/app/time-off", "/app/scores", "/app/activity", "/app/summary", "/app/billing", "/app/grow", "/app/deliverables", "/app/vendors", "/app/venues", "/app/services", "/app/partners", "/app/inventory", "/app/messages"].some((p) => pathname.startsWith(p));
  if (href === "/app/money/quotes") return ["/app/money/quotes", "/app/quotes"].some((p) => pathname.startsWith(p));
  if (href === "/app/money") return ["/app/money", "/app/quotes", "/app/bills", "/app/reports"].some((p) => pathname.startsWith(p));
  return pathname.startsWith(href);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { workspace } = useCurrentWorkspace();
  const nav = NAV.filter((n) => !n.show || n.show(workspace));
  const tabs = nav;
  const activeTab = tabs.find((n) => isActive(pathname, n.href))?.href ?? null;

  // Tasks come right after Events: a group for those who give tasks, one link for everyone
  // else. They stay when Events isn't on someone's screens.
  const tasks = taskSections(workspace);
  const tasksItem = !can(workspace, "tasks.work") ? null : tasks.length > 1 ? (
    <NavGroup
      label="Team Task Management"
      icon={ClipboardList}
      href="/app/tasks"
      sections={tasks}
      current={taskSectionOf(pathname)}
      active={taskSectionOf(pathname) !== null}
    />
  ) : (
    <NavLink href="/app/tasks" label="My tasks" icon={ClipboardList} active={taskSectionOf(pathname) !== null} />
  );

  return (
    <div className="min-h-dvh bg-surface lg:pl-76 print:pl-0">
      {/* Desktop: a floating white panel, like PhotoLancer's studio menu */}
      <aside className="fixed inset-y-4 left-4 hidden w-64 print:!hidden flex-col rounded-3xl border border-line bg-surface p-3 shadow-soft lg:flex">
        <div className="px-2 pb-5 pt-3">
          <Logo className="[&_svg]:size-9 [&>span:last-child]:text-lg" />
        </div>
        <Link
          href="/app/more"
          className="mb-4 flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5 transition hover:bg-sun-100"
        >
          <BusinessMark logoUrl={workspace.logoUrl} icon={workspace.businessTypeIcon} name={workspace.name} size="sm" tone="surface" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{workspace.name}</span>
            <span className="block truncate text-xs text-ink-muted">{workspace.businessTypeName}</span>
          </span>
        </Link>
        <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1" aria-label="Main">
          {NAV.filter((n) => n.href !== "/app/more").map(({ href, label, icon: Icon, show }) => {
            const active = isActive(pathname, href);
            const item = show && !show(workspace) ? null : href === "/app/money" ? (
              <NavGroup label={label} icon={Icon} href={href} sections={moneySections(workspace)} current={moneySectionOf(pathname)} active={active} />
            ) : (
              <NavLink href={href} label={label} icon={Icon} active={active} />
            );
            return (
              <Fragment key={href}>
                {item}
                {href === "/app/events" && tasksItem}
              </Fragment>
            );
          })}
          <NavGroup
            label="Master data"
            icon={Database}
            href="/app/masters"
            sections={masterSections(workspace)}
            current={masterSectionOf(pathname)}
            active={inMasterData(pathname)}
          />
          <NavLink href="/app/my-day" label="My day" icon={Sun} active={pathname.startsWith("/app/my-day")} />
          <AlertBell
            label
            className={cn(
              "rounded-2xl px-3 py-2.5 text-sm font-semibold",
              pathname.startsWith("/app/notifications") ? "bg-gradient-primary text-on-brand shadow-warm" : "text-ink-muted hover:bg-cream hover:text-brand-strong",
            )}
          />
        </nav>
        {/* More sits at the foot of the menu; on a computer, Master data and My day no longer count as More. */}
        <div className="mt-3 border-t border-line pt-3">
          <NavLink
            href="/app/more"
            label="More"
            icon={Menu}
            active={isActive(pathname, "/app/more") && !inMasterData(pathname) && taskSectionOf(pathname) === null && !pathname.startsWith("/app/my-day") && !pathname.startsWith("/app/notifications")}
          />
        </div>
      </aside>

      {/* Phone: the business and the bell, above every page */}
      <header className="flex items-center gap-3 px-4 pt-3 sm:px-6 lg:hidden print:hidden">
        <Link href="/app/more" className="flex min-w-0 flex-1 items-center gap-2.5">
          <BusinessMark logoUrl={workspace.logoUrl} icon={workspace.businessTypeIcon} name={workspace.name} size="sm" tone="cream" />
          <span className="truncate text-sm font-bold">{workspace.name}</span>
        </Link>
        <Link
          href="/app/my-day"
          aria-label="My day"
          className={cn("grid size-10 place-items-center rounded-full text-ink-muted hover:bg-cream", pathname.startsWith("/app/my-day") && "bg-cream text-brand-strong")}
        >
          <Sun className="size-5" strokeWidth={2} />
        </Link>
        <AlertBell
          className={cn("grid size-10 place-items-center rounded-full text-ink-muted hover:bg-cream", pathname.startsWith("/app/notifications") && "bg-cream text-brand-strong")}
        />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 sm:px-6 lg:px-8 lg:pb-12 lg:pt-10 print:max-w-none print:p-0">{children}</main>

      {/* Phone: white tab bar; the active icon sits in a small gradient pill */}
      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden print:hidden"
      >
        <ul className={cn("mx-auto grid max-w-md pt-2", TAB_COLUMNS[tabs.length])}>
          {tabs.map(({ href, label, short, icon: Icon }) => {
            const active = activeTab === href;
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
                  {short ?? label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition",
        active ? "bg-gradient-primary text-on-brand shadow-warm" : "text-ink-muted hover:bg-cream hover:text-brand-strong",
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={2} />
      {label}
    </Link>
  );
}

/**
 * A menu item with its parts under it (Payments and invoices, Master data): open while
 * you're in it, and the arrow shows them from anywhere else without leaving the page.
 */
function NavGroup({
  label,
  icon: Icon,
  href,
  sections,
  current,
  active,
}: {
  label: string;
  icon: LucideIcon;
  href: string;
  sections: { key: string; label: string; href: string; icon: LucideIcon }[];
  current: string | null;
  active: boolean;
}) {
  const [peek, setPeek] = useState(false);
  const open = active || peek;
  return (
    <div>
      <div
        className={cn(
          "flex items-center rounded-2xl text-sm font-semibold transition",
          active ? "bg-gradient-primary text-on-brand shadow-warm" : "text-ink-muted hover:bg-cream hover:text-brand-strong",
        )}
      >
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3">
          <Icon className="size-[18px] shrink-0" strokeWidth={2} />
          <span className="truncate tracking-[-0.01em]">{label}</span>
        </Link>
        {!active && (
          <button
            type="button"
            onClick={() => setPeek((p) => !p)}
            aria-expanded={open}
            aria-label={open ? `Hide the parts of ${label}` : `Show the parts of ${label}`}
            className="mr-1 grid size-6 shrink-0 place-items-center rounded-md hover:bg-sun-100"
          >
            <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
          </button>
        )}
        {active && <ChevronDown className="mr-2 size-4 shrink-0 rotate-180" aria-hidden />}
      </div>
      {open && (
        <ul className="ml-[22px] mt-1 flex flex-col gap-0.5 border-l border-line pl-2" aria-label={label}>
          {sections.map(({ key, label: text, href: to, icon: SubIcon }) => {
            const here = current === key;
            return (
              <li key={key}>
                <Link
                  href={to}
                  aria-current={here ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition",
                    here ? "bg-cream text-brand-strong" : "text-ink-muted hover:bg-cream hover:text-brand-strong",
                  )}
                >
                  <SubIcon className="size-4 shrink-0" strokeWidth={2} />
                  {text}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
