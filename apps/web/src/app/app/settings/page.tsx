"use client";

import { can, leadScope } from "@wedding-yantra/core";
import {
  Award,
  Bell,
  Building2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  GitBranch,
  Handshake,
  History,
  ListPlus,
  MessageCircle,
  QrCode,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Card, PageHeader } from "@/components/ui/misc";

interface Item {
  href: string;
  icon: LucideIcon;
  label: string;
  about: string;
  show: boolean;
}

/**
 * Everything you set up once and change now and then, in one place, so More can keep to
 * what people open every day. Each row shows only for those who could open it from More.
 */
export default function SettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const sells = leadScope(workspace) !== "none";

  const sections: { title: string; items: Item[] }[] = [
    {
      title: "Your business",
      items: [
        { href: "/app/settings/business", icon: Building2, label: "Business profile", about: "Name, logo and the details on your quotes and bills", show: true },
        {
          href: "/app/masters",
          icon: Database,
          label: "Master data",
          about: "Clients, employees, departments, vendors, venues, services and your lists",
          show: true,
        },
        { href: "/app/settings/invoices", icon: FileText, label: "Invoice settings", about: "Bank, terms and design: every new invoice picks them up", show: can(workspace, "bills.manage") },
        { href: "/app/billing", icon: CreditCard, label: "Plan and billing", about: "Your Wedding Yantra plan and payments", show: can(workspace, "billing.manage") },
      ],
    },
    {
      title: "Sales and enquiries",
      items: [
        { href: "/app/settings/enquiry-form", icon: QrCode, label: "Enquiry form", about: "A link and QR code anyone can fill; each enquiry becomes a lead", show: sells },
        { href: "/app/settings/stages", icon: GitBranch, label: "Sales stages", about: "The steps every lead moves through, from first enquiry to booked", show: sells },
        { href: "/app/settings/replies", icon: MessageCircle, label: "WhatsApp replies", about: "Ready-made messages you send from a lead in one tap", show: sells },
        { href: "/app/partners", icon: Handshake, label: "Partner QR codes", about: "Each partner's own QR code; their enquiries are credited to them", show: can(workspace, "leads.view_all") },
      ],
    },
    {
      title: "Team and work",
      items: [
        { href: "/app/settings/checklist", icon: ClipboardList, label: "Event checklist", about: "What gets done for every event, added in one tap", show: can(workspace, "tasks.work") && can(workspace, "tasks.manage") },
        {
          href: "/app/settings/points",
          icon: Award,
          label: "Points rules",
          about: "What each finished task earns, penalties and leaderboard bands",
          show: can(workspace, "tasks.work") && can(workspace, "workspace.update"),
        },
        { href: "/app/activity", icon: History, label: "Activity", about: "Who did what, newest first", show: can(workspace, "team.review") },
      ],
    },
    {
      title: "Make it yours",
      items: [
        { href: "/app/settings/fields", icon: ListPlus, label: "Your own fields", about: "The extra details your business always asks for, on every form", show: can(workspace, "workspace.update") },
      ],
    },
    {
      title: "You",
      items: [
        { href: "/app/settings/profile", icon: UserRound, label: "Your profile", about: "Your name and number, the same in every business", show: true },
        { href: "/app/notifications?tab=settings", icon: Bell, label: "Alerts", about: "What reaches you, and when", show: true },
      ],
    },
  ];

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Settings" subtitle="Set it up once; change it whenever the business changes." />
      {sections.map(({ title, items }) => {
        const shown = items.filter((i) => i.show);
        if (!shown.length) return null;
        return (
          <section key={title} className="mb-6">
            <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">{title}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {shown.map(({ href, icon: Icon, label, about }) => (
                <Link key={href} href={href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-cream">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
                    <Icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{label}</span>
                    <span className="block text-sm text-ink-muted">{about}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              ))}
            </Card>
          </section>
        );
      })}
    </>
  );
}
