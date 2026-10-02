/**
 * Who can do what. The API enforces these rules; the apps use the same rules only to
 * decide which buttons to show. Changing a rule here changes it everywhere.
 *
 * A role is how much someone can do. Which screens they get comes from their department
 * (see access.ts); with no department, a role gets the grants below, as it always has.
 */

export const ROLES = ["owner", "manager", "staff", "freelancer", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_INFO: Record<Role, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Everything, always, including the plan and everyone's pay" },
  manager: {
    label: "Manager",
    description: "Full control of their department's screens, and gives tasks to their team. With no department: everything but the plan and pay",
  },
  staff: {
    label: "Staff",
    description: "Does the work on their department's screens, with only their own leads. With no department: own leads, every event, tasks",
  },
  freelancer: { label: "Freelancer", description: "Sees only the events they're booked on, and their tasks" },
  accountant: {
    label: "View only",
    description: "Looks at their department's screens but changes nothing, and has no tasks. With no department: sees the money, read-only (for your CA)",
  },
};

export const PERMISSIONS = [
  "workspace.update",
  "members.view",
  "members.invite",
  "members.manage",
  /** Change employee details, and see everyone's pay, bank and PAN. The owner only. */
  "members.hr",
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
  /** Make, change and cancel bills */
  "bills.manage",
  /** Record money received from clients */
  "payments.record",
  /** Add money spent, with a bill photo. Staff's need approval. */
  "expenses.submit",
  /** Approve or reject expenses, and change anyone's */
  "expenses.approve",
  /** Give tasks to anyone, edit the checklist, choose who works each event */
  "tasks.manage",
  /** See and finish your own tasks, add tasks for yourself */
  "tasks.work",
  /** Everyone's scores, the activity log and the daily summary */
  "team.review",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** What each role gets when no department decides their screens. */
export const ROLE_GRANTS: Record<Role, readonly Permission[]> = {
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
    "bills.manage",
    "payments.record",
    "expenses.submit",
    "expenses.approve",
    "tasks.manage",
    "tasks.work",
    "team.review",
  ],
  staff: ["members.view", "leads.work", "events.view", "expenses.submit", "tasks.work"],
  // Freelancers see only the events they're booked on (see eventScope) and their tasks.
  freelancer: ["tasks.work"],
  accountant: ["members.view", "finance.view", "clients.view", "quotes.view", "events.view"],
};

/**
 * What someone can do: their role, and the permissions worked out for them (see
 * resolveAccess in access.ts). The API's member context and the web's workspace both fit.
 */
export interface Access {
  role: Role;
  permissions: readonly Permission[];
}

/** Whether this person may do something. */
export function can(who: Access, permission: Permission): boolean {
  // An older API (during a deploy) sends no permissions: fall back to the role's usual ones.
  const permissions = (who.permissions as readonly Permission[] | undefined) ?? ROLE_GRANTS[who.role] ?? [];
  return permissions.includes(permission);
}

/** Whether a role, with no department, may do something. Only for role defaults. */
export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_GRANTS[role].includes(permission);
}

/** The owner and managers: the people who check others' work, such as approving expenses. */
export function isOwnerOrManager(role: Role): boolean {
  return role === "owner" || role === "manager";
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
export function leadScope(who: Access): "all" | "own" | "none" {
  if (can(who, "leads.view_all")) return "all";
  if (can(who, "leads.work")) return "own";
  return "none";
}

/**
 * Which events someone sees: all of them, only the ones they're on the team for
 * (freelancers), or none.
 */
export function eventScope(who: Access): "all" | "own" | "none" {
  if (can(who, "events.view")) return "all";
  if (can(who, "tasks.work")) return "own";
  return "none";
}

/**
 * Which quotes someone sees and changes: people who see every lead see every quote; people
 * who make quotes without that (staff) see only the quotes they made or that are on their
 * own leads; people who only look (View only) see them all.
 */
export function quoteScope(who: Access): "all" | "own" | "none" {
  if (!can(who, "quotes.view")) return "none";
  if (can(who, "leads.view_all")) return "all";
  return can(who, "quotes.manage") ? "own" : "all";
}

/**
 * Whose work someone runs: everyone (the owner, and managers with the Team screen or no
 * department), the people in their own department (other managers), or only themselves.
 */
export function teamScope(who: Access): "all" | "department" | "self" {
  if (!can(who, "tasks.manage")) return "self";
  return can(who, "members.manage") ? "all" : "department";
}
