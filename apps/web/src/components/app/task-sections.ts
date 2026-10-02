import { can, type Role } from "@wedding-yantra/core";
import { CalendarCheck, ListChecks, Send, UsersRound, type LucideIcon } from "lucide-react";

export type TaskSection = "mine" | "given" | "team" | "summary";

export interface TaskSectionLink {
  key: TaskSection;
  label: string;
  href: string;
  icon: LucideIcon;
}

/** The parts of Team Task Management in the side menu, for the people who give tasks. */
export function taskSections(role: Role): TaskSectionLink[] {
  const list: (TaskSectionLink & { show: boolean })[] = [
    { key: "mine", label: "My tasks", href: "/app/tasks", icon: ListChecks, show: true },
    { key: "given", label: "Given by me", href: "/app/tasks/given", icon: Send, show: can(role, "tasks.manage") },
    { key: "team", label: "Team board", href: "/app/tasks/team", icon: UsersRound, show: can(role, "tasks.manage") },
    { key: "summary", label: "Daily summary", href: "/app/summary", icon: CalendarCheck, show: can(role, "team.review") },
  ];
  return list.filter((s) => s.show);
}

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Which part a page belongs to; one person's task page counts as the team board. */
export function taskSectionOf(pathname: string): TaskSection | null {
  if (under(pathname, "/app/tasks/given")) return "given";
  if (under(pathname, "/app/tasks/team") || under(pathname, "/app/tasks/people")) return "team";
  if (under(pathname, "/app/summary")) return "summary";
  if (under(pathname, "/app/tasks")) return "mine";
  return null;
}
