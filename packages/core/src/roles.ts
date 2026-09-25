/**
 * Who can do what. The API enforces these rules; the apps use the same rules only to
 * decide which buttons to show. Changing a rule here changes it everywhere.
 */

export const ROLES = ["owner", "manager", "staff", "freelancer", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Everything, including money and subscription" },
  manager: { label: "Manager", description: "Runs the business day to day. No subscription or payroll" },
  staff: { label: "Staff", description: "Sees their own events and tasks, logs expenses" },
  freelancer: { label: "Freelancer", description: "Sees only the events they are booked on" },
  accountant: { label: "Accountant", description: "Read-only access to money, can export" },
};

export const PERMISSIONS = [
  "workspace.update",
  "members.view",
  "members.invite",
  "members.manage",
  "finance.view",
  "billing.manage",
  /** Add leads and work on the ones you can see */
  "leads.work",
  /** See every lead, not just your own */
  "leads.view_all",
  /** Give a lead to someone on the team */
  "leads.assign",
  "leads.delete",
  "clients.view",
  "clients.manage",
  /** Change the price list */
  "catalogue.manage",
  "quotes.view",
  "quotes.manage",
  "events.view",
  "events.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: [
    "workspace.update",
    "members.view",
    "members.invite",
    "members.manage",
    "finance.view",
    "leads.work",
    "leads.view_all",
    "leads.assign",
    "leads.delete",
    "clients.view",
    "clients.manage",
    "catalogue.manage",
    "quotes.view",
    "quotes.manage",
    "events.view",
    "events.manage",
  ],
  staff: ["members.view", "leads.work", "events.view"],
  freelancer: [],
  accountant: ["members.view", "finance.view", "clients.view", "quotes.view", "events.view"],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

/**
 * Roles this person may give to someone else. Nobody can create a second owner, and a
 * manager cannot create another manager.
 */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["manager", "staff", "freelancer", "accountant"];
  if (actor === "manager") return ["staff", "freelancer", "accountant"];
  return [];
}

/** Whether `actor` may change or remove a member who currently has `target` role. */
export function canManageMember(actor: Role, target: Role): boolean {
  if (target === "owner") return false;
  if (actor === "owner") return true;
  return actor === "manager" && target !== "manager";
}

/**
 * Which leads someone sees: every lead, only the ones they created or were given, or none.
 * Staff see their own so each person's list stays short and theirs.
 */
export function leadScope(role: Role): "all" | "own" | "none" {
  if (can(role, "leads.view_all")) return "all";
  if (can(role, "leads.work")) return "own";
  return "none";
}
