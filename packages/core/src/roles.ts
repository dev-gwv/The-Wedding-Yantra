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
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: ["workspace.update", "members.view", "members.invite", "members.manage", "finance.view"],
  staff: ["members.view"],
  freelancer: [],
  accountant: ["members.view", "finance.view"],
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
