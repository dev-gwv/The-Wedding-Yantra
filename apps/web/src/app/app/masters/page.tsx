"use client";

import { can, eventScope } from "@wedding-yantra/core";
import { useClients } from "@wedding-yantra/api-client/react";
import { ChevronRight, HandCoins, MapPin, Package, Tags, Users, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Card, PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

interface Tile {
  key: string;
  title: string;
  about: string;
  icon: LucideIcon;
  /** Where it opens today; none yet for a master still to come */
  href: string | null;
  /** Built as a master already, or still to come (and what's coming) */
  status: "live" | "next";
  show: boolean;
  count?: number | null;
}

/**
 * The records everything else is built on: who you work for, who works with you, who you
 * hire, where events happen, and what you sell. One place to keep them right.
 */
export default function MastersPage() {
  const { workspace } = useCurrentWorkspace();
  const role = workspace.role;
  const clients = useClients(workspace.id, "", false, can(role, "clients.view"));

  const tiles: Tile[] = [
    {
      key: "clients",
      title: "Clients",
      about: "Families and companies: contacts, the wedding, billing",
      icon: UsersRound,
      href: "/app/clients",
      status: "live",
      show: can(role, "clients.view"),
      count: clients.data?.length ?? null,
    },
    {
      key: "employees",
      title: "Employees",
      about: "Your team. Coming next: designation, pay and bank details",
      icon: Users,
      href: "/app/team",
      status: "next",
      show: true,
    },
    {
      key: "vendors",
      title: "Vendors",
      about: "Florists, tent, DJ, caterers. Coming next: category, bank, GST",
      icon: HandCoins,
      href: can(role, "finance.view") ? "/app/vendors" : null,
      status: "next",
      show: can(role, "finance.view"),
    },
    {
      key: "venues",
      title: "Venues",
      about: "Coming next: address, Maps link, contact, rules",
      icon: MapPin,
      href: null,
      status: "next",
      show: eventScope(role) !== "none",
    },
    {
      key: "services",
      title: "Services and packages",
      about: "What you sell and its prices. Coming next: packages",
      icon: Package,
      href: "/app/settings/services",
      status: "next",
      show: can(role, "catalogue.manage") || can(role, "quotes.view"),
    },
    {
      key: "lists",
      title: "Lists",
      about: "Choices in the forms: relations, payment modes, categories",
      icon: Tags,
      href: "/app/settings/lists",
      status: "live",
      show: can(role, "workspace.update"),
    },
  ];

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Master data" subtitle="The records everything else is built on. Keep them right once, and quotes, invoices and events fill themselves in." />
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles
          .filter((t) => t.show)
          .map((t) => {
            const Icon = t.icon;
            const body = (
              <>
                <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl", t.status === "live" ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-brand-strong")}>
                  <Icon className="size-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-lg font-extrabold">{t.title}</span>
                    {t.status === "next" && <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-bold text-ink-muted">Coming next</span>}
                    {t.count != null && <span className="text-sm font-bold text-ink-muted tabular">{t.count}</span>}
                  </span>
                  <span className="block text-sm text-ink-muted">{t.about}</span>
                </span>
                {t.href && <ChevronRight className="size-5 shrink-0 text-ink-subtle" />}
              </>
            );
            return t.href ? (
              <Link key={t.key} href={t.href} className="block">
                <Card className="flex h-full items-center gap-4 p-4 transition hover:border-sun-300 sm:p-5">{body}</Card>
              </Link>
            ) : (
              <Card key={t.key} className="flex items-center gap-4 p-4 opacity-80 sm:p-5">
                {body}
              </Card>
            );
          })}
      </div>
    </>
  );
}
