import { can, type Role } from "@wedding-yantra/core";
import { Building2, HandCoins, MapPin, Package, Tags, Users, UsersRound, type LucideIcon } from "lucide-react";

export type MasterKey = "clients" | "employees" | "departments" | "vendors" | "venues" | "services" | "lists";

export interface MasterSection {
  key: MasterKey;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Pages that belong to it, besides its own address */
  paths: string[];
}

/** The records under Master data that this role may open, in the side menu and on the tiles. */
export function masterSections(role: Role): MasterSection[] {
  const all: (MasterSection & { show: boolean })[] = [
    { key: "clients", label: "Clients", href: "/app/clients", icon: UsersRound, paths: ["/app/clients"], show: can(role, "clients.view") },
    {
      key: "employees",
      label: "Employees",
      // Those who can't see the team see their own details.
      href: can(role, "members.view") ? "/app/team" : "/app/team/me",
      icon: Users,
      paths: ["/app/team"],
      show: true,
    },
    { key: "departments", label: "Departments", href: "/app/departments", icon: Building2, paths: ["/app/departments"], show: can(role, "members.view") },
    { key: "vendors", label: "Vendors", href: "/app/vendors", icon: HandCoins, paths: ["/app/vendors"], show: can(role, "finance.view") },
    { key: "venues", label: "Venues", href: "/app/venues", icon: MapPin, paths: ["/app/venues"], show: can(role, "events.view") },
    {
      key: "services",
      label: "Services & packages",
      href: "/app/services",
      icon: Package,
      paths: ["/app/services", "/app/settings/services"],
      show: can(role, "catalogue.manage") || can(role, "quotes.view"),
    },
    { key: "lists", label: "Lists", href: "/app/settings/lists", icon: Tags, paths: ["/app/settings/lists"], show: can(role, "workspace.update") },
  ];
  return all.filter((s) => s.show);
}

const MASTER_PATHS: [MasterKey, string][] = [
  ["clients", "/app/clients"],
  ["employees", "/app/team"],
  ["departments", "/app/departments"],
  ["vendors", "/app/vendors"],
  ["venues", "/app/venues"],
  ["services", "/app/services"],
  ["services", "/app/settings/services"],
  ["lists", "/app/settings/lists"],
];

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Which master a page belongs to, if any. */
export function masterSectionOf(pathname: string): MasterKey | null {
  return MASTER_PATHS.find(([, base]) => under(pathname, base))?.[0] ?? null;
}

/** On Master data, or one of its records. */
export function inMasterData(pathname: string): boolean {
  return under(pathname, "/app/masters") || masterSectionOf(pathname) !== null;
}
