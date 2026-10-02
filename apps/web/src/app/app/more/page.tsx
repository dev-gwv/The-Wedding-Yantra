"use client";

import { can, eventScope, formatPhone, ROLE_INFO } from "@wedding-yantra/core";
import { useApi, useLogout } from "@wedding-yantra/api-client/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarOff,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  IndianRupee,
  ListChecks,
  LogOut,
  Megaphone,
  MessageSquareText,
  Package,
  Plus,
  ReceiptText,
  Settings,
  Star,
  Sun,
  Trophy,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BusinessIcon } from "@/components/app/business-icon";
import { BusinessMark } from "@/components/app/business-mark";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Avatar, Card, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { disablePush } from "@/lib/push";
import { clearSession } from "@/lib/session";

export default function MorePage() {
  const { me, workspace, switchTo } = useCurrentWorkspace();
  const logout = useLogout();
  const api = useApi();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const work = can(workspace, "tasks.work");
  // Used now and then: tucked away, still one tap from here.
  const tools: { href: string; icon: LucideIcon; label: string }[] = [
    ...(work ? [{ href: "/app/deliverables", icon: Package, label: "Deliverables" }] : []),
    ...(work && eventScope(workspace) === "all" ? [{ href: "/app/inventory", icon: Boxes, label: "Stock" }] : []),
    ...(work ? [{ href: "/app/time-off", icon: CalendarOff, label: "Days off" }] : []),
    ...(work ? [{ href: "/app/scores", icon: Trophy, label: can(workspace, "team.review") ? "Team scores and points" : "My points and score" }] : []),
    ...(work && can(workspace, "team.review") ? [{ href: "/app/summary", icon: MessageSquareText, label: "Daily summary" }] : []),
    ...(can(workspace, "clients.manage") ? [{ href: "/app/grow", icon: Star, label: "Reviews and referrals" }] : []),
    ...(can(workspace, "clients.manage") ? [{ href: "/app/messages", icon: Megaphone, label: "Wishes and offers" }] : []),
  ];

  async function signOut() {
    // This phone stops getting this person's alerts.
    await disablePush(api).catch(() => undefined);
    await logout.mutateAsync().catch(() => undefined);
    queryClient.clear();
    clearSession();
    window.location.replace("/login");
  }

  return (
    <>
      <PageHeader title="More" />

      <Card className="mb-6 flex items-center gap-4 p-5">
        <BusinessMark logoUrl={workspace.logoUrl} icon={workspace.businessTypeIcon} name={workspace.name} tone="cream" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-extrabold">{workspace.name}</p>
          <p className="truncate text-sm text-ink-muted">
            {workspace.businessTypeName} · You&apos;re {ROLE_INFO[workspace.role].label}
            {workspace.role !== "owner" && workspace.departmentLabel && ` in ${workspace.departmentLabel}`}
          </p>
        </div>
      </Card>

      {/* What people open every day; everything you set up once lives under Settings. */}
      <Card className="mb-6 divide-y divide-line overflow-hidden">
        {work && <Row href="/app/my-day" icon={Sun} label="My day" />}
        {work && <Row href="/app/tasks" icon={ListChecks} label="Tasks" />}
        {can(workspace, "clients.view") && <Row href="/app/clients" icon={UsersRound} label="Clients" />}
        {/* Without the money, Quotes isn't under Payments and invoices. */}
        {can(workspace, "quotes.view") && !can(workspace, "finance.view") && <Row href="/app/money/quotes" icon={FileText} label="Quotes" />}
        {can(workspace, "finance.view") && <Row href="/app/money" icon={IndianRupee} label="Payments and invoices" />}
        {can(workspace, "expenses.submit") && !can(workspace, "finance.view") && <Row href="/app/expenses" icon={ReceiptText} label="My expenses" />}
        {can(workspace, "finance.view") && <Row href="/app/reports" icon={BarChart3} label="Reports" />}
        <Row href="/app/team" icon={Users} label="Team" />
        <Row href="/app/notifications" icon={Bell} label="Alerts" />
      </Card>

      <Link href="/app/settings" className="mb-6 flex items-center gap-4 rounded-3xl border border-line bg-surface p-4 shadow-soft transition hover:border-sun-300 sm:p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-on-brand shadow-soft">
          <Settings className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-extrabold">Settings</span>
          <span className="block text-sm text-ink-muted">Business profile, master data, invoices, sales setup and your alerts</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-ink-subtle" />
      </Link>

      {tools.length > 0 && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowTools((o) => !o)}
            aria-expanded={showTools}
            className="flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-2 text-left text-xs font-extrabold uppercase tracking-wider text-ink-muted hover:text-ink"
          >
            More tools ({tools.length})
            <ChevronDown className={cn("size-4 transition", showTools && "rotate-180")} />
          </button>
          {showTools && (
            <Card className="mt-1 divide-y divide-line overflow-hidden">
              {tools.map((t) => (
                <Row key={t.href} {...t} />
              ))}
            </Card>
          )}
        </div>
      )}

      <Card className="divide-y divide-line overflow-hidden">
        <Link href="/app/settings/profile" className="flex items-center gap-3 px-5 py-4 hover:bg-cream">
          <Avatar name={me.user.name} className="size-8 text-xs" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.user.name ?? "Your profile"}</span>
            <span className="block text-xs text-ink-muted tabular">{formatPhone(me.user.phone)}</span>
          </span>
          <ChevronRight className="size-4 text-ink-subtle" />
        </Link>
        {me.workspaces.length > 1 && (
          <Row onClick={() => setSwitching(true)} icon={ArrowLeftRight} label="Switch business" />
        )}
        <Row href="/onboarding" icon={Plus} label="Add another business" />
        <Row href="/help" icon={CircleHelp} label="Help" />
        <Row onClick={signOut} icon={LogOut} label="Sign out" tone="danger" chevron={false} />
      </Card>

      <Sheet open={switching} onClose={() => setSwitching(false)} title="Switch business">
        <ul className="-mx-2 space-y-1">
          {me.workspaces.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => {
                  setSwitching(false);
                  switchTo(w.id);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-cream"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-cream text-brand-strong">
                  <BusinessIcon name={w.businessTypeIcon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{w.name}</span>
                  <span className="block text-xs text-ink-muted">{ROLE_INFO[w.role].label}</span>
                </span>
                {w.id === workspace.id && <Check className="size-4 text-brand" />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function Row({
  href,
  onClick,
  icon: Icon,
  label,
  tone,
  chevron = true,
}: {
  href?: string;
  onClick?: () => void;
  icon: LucideIcon;
  label: string;
  tone?: "danger";
  chevron?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-3 px-5 py-4 text-left text-[15px] font-semibold hover:bg-cream",
    tone === "danger" && "text-danger",
  );
  const body = (
    <>
      <Icon className={cn("size-5", tone === "danger" ? "text-danger" : "text-ink-muted")} strokeWidth={1.75} />
      <span className="flex-1">{label}</span>
      {chevron && <ChevronRight className="size-4 text-ink-subtle" />}
    </>
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

