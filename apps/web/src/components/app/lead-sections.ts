import { can, leadScope, type Access } from "@wedding-yantra/core";
import { Handshake, Inbox, QrCode, type LucideIcon } from "lucide-react";

export type LeadSection = "leads" | "form" | "partners";

export interface LeadSectionLink {
  key: LeadSection;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const ENQUIRY_FORM_PATH = "/app/leads/enquiry-form";

/** The parts of Leads in the side menu: the leads, and where enquiries come in from. */
export function leadSections(who: Access): LeadSectionLink[] {
  const list: (LeadSectionLink & { show: boolean })[] = [
    { key: "leads", label: "All leads", href: "/app/leads", icon: Inbox, show: true },
    { key: "form", label: "Enquiry form & QR", href: ENQUIRY_FORM_PATH, icon: QrCode, show: leadScope(who) !== "none" },
    { key: "partners", label: "Partner QR codes", href: "/app/partners", icon: Handshake, show: can(who, "leads.view_all") },
  ];
  return list.filter((s) => s.show);
}

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Which part a page belongs to; a partner's own page counts as Partner QR codes. */
export function leadSectionOf(pathname: string): LeadSection | null {
  if (under(pathname, ENQUIRY_FORM_PATH)) return "form";
  if (under(pathname, "/app/partners")) return "partners";
  if (under(pathname, "/app/leads")) return "leads";
  return null;
}
