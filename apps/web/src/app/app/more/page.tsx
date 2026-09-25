"use client";

import { formatPhone, ROLE_INFO } from "@wedding-yantra/core";
import { useLogout } from "@wedding-yantra/api-client/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Building2, Check, ChevronRight, LogOut, Plus, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BusinessIcon } from "@/components/app/business-icon";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Avatar, Card, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { clearSession } from "@/lib/session";

export default function MorePage() {
  const { me, workspace, switchTo } = useCurrentWorkspace();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [switching, setSwitching] = useState(false);

  async function signOut() {
    await logout.mutateAsync().catch(() => undefined);
    clearSession();
    queryClient.clear();
    window.location.replace("/login");
  }

  return (
    <>
      <PageHeader title="More" />

      <Card className="mb-6 flex items-center gap-4 p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <BusinessIcon name={workspace.businessTypeIcon} className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{workspace.name}</p>
          <p className="truncate text-sm text-ink-muted">
            {workspace.businessTypeName} · You are {ROLE_INFO[workspace.role].label.toLowerCase()}
          </p>
        </div>
      </Card>

      <Card className="mb-6 divide-y divide-line overflow-hidden">
        <Row href="/app/settings/business" icon={Building2} label="Business profile" />
        <Row href="/app/team" icon={Users} label="Team" />
        {me.workspaces.length > 1 && (
          <Row onClick={() => setSwitching(true)} icon={ArrowLeftRight} label="Switch business" />
        )}
        <Row href="/onboarding" icon={Plus} label="Add another business" />
      </Card>

      <Card className="divide-y divide-line overflow-hidden">
        <Link href="/app/settings/profile" className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-muted">
          <Avatar name={me.user.name} className="size-8 text-xs" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{me.user.name ?? "Your profile"}</span>
            <span className="block text-xs text-ink-muted tabular">{formatPhone(me.user.phone)}</span>
          </span>
          <ChevronRight className="size-4 text-ink-subtle" />
        </Link>
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
                className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface-muted"
              >
                <span className="grid size-9 place-items-center rounded-md bg-brand-soft text-brand">
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
    "flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium hover:bg-surface-muted",
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

