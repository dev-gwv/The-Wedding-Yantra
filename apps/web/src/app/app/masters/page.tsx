"use client";

import { can } from "@wedding-yantra/core";
import { useClients, useTeam, useVendors, useVenues } from "@wedding-yantra/api-client/react";
import { ChevronRight, HandCoins, MapPin, Package, Tags, Users, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/app/back-link";
import { masterSections } from "@/components/app/master-sections";
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
  const vendors = useVendors(workspace.id, can(role, "finance.view"));
  const team = useTeam(can(role, "members.view") ? workspace.id : null);
  const venues = useVenues(workspace.id, can(role, "events.view"));
  // The same records, for the same people, as under Master data in the side menu.
  const visible = new Map(masterSections(role).map((s) => [s.key as string, s.href]));

  const tiles: Tile[] = [
    {
      key: "clients",
      title: "Clients",
      about: "Who booked you, emergency contacts, the wedding",
      icon: UsersRound,
      href: visible.get("clients") ?? null,
      status: "live",
      show: visible.has("clients"),
      count: clients.data?.length ?? null,
    },
    {
      key: "employees",
      title: "Employees",
      about: can(role, "members.hr") ? "Your team: designation, emergency contact, pay and bank" : "Your team: designation and emergency contact",
      icon: Users,
      href: visible.get("employees") ?? null,
      status: "live",
      show: visible.has("employees"),
      count: team.data?.members.length ?? null,
    },
    {
      key: "vendors",
      title: "Vendors",
      about: "Who you hire: category, contact, UPI and bank, GST",
      icon: HandCoins,
      href: visible.get("vendors") ?? null,
      status: "live",
      show: visible.has("vendors"),
      count: vendors.data?.length ?? null,
    },
    {
      key: "venues",
      title: "Venues",
      about: "Where events happen: address, Maps link, contact, rules",
      icon: MapPin,
      href: visible.get("venues") ?? null,
      status: "live",
      show: visible.has("venues"),
      count: venues.data?.length ?? null,
    },
    {
      key: "services",
      title: "Services and packages",
      about: "What you sell, grouped your way, and packages at one price",
      icon: Package,
      href: visible.get("services") ?? null,
      status: "live",
      show: visible.has("services"),
    },
    {
      key: "lists",
      title: "Lists",
      about: "Choices in the forms: service categories, designations, vendor and venue types, payment modes",
      icon: Tags,
      href: visible.get("lists") ?? null,
      status: "live",
      show: visible.has("lists"),
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
