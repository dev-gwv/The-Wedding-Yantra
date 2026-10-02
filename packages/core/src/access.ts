/**
 * Department-based access. A department decides which screens someone gets; their role
 * decides how much they can do on them. The owner can also switch on extra screens for one
 * person. Someone with no department (or one placed before departments decided screens)
 * keeps their role's usual grants, so nothing changes until the owner places them.
 */

import { PERMISSIONS, ROLE_GRANTS, type Access, type Permission, type Role } from "./roles.js";

export const AREAS = ["leads", "quotes", "clients", "events", "money", "team", "settings"] as const;
export type Area = (typeof AREAS)[number];

export interface AreaInfo {
  label: string;
  /** What the screen opens, in a line */
  opens: string;
  permissions: readonly Permission[];
}

export const AREA_INFO: Record<Area, AreaInfo> = {
  leads: {
    label: "Leads & follow-ups",
    opens: "Leads, follow-ups, the enquiry form and its QR code, WhatsApp replies. Managers also get partner QR codes, sales stages and every lead.",
    permissions: ["leads.work", "leads.view_all", "leads.assign", "leads.delete"],
  },
  quotes: {
    label: "Quotes & prices",
    opens: "Quotes and the price list (services and packages). Staff quote on their own leads; managers see every quote and change prices.",
    permissions: ["quotes.view", "quotes.manage", "catalogue.manage"],
  },
  clients: {
    label: "Clients",
    opens: "The client list and each client's page, reviews and referrals, wishes and offers.",
    permissions: ["clients.view", "clients.manage"],
  },
  events: {
    label: "Events & calendar",
    opens: "Every event and the calendar, deliverables, venues and stock. Managers add, change and cancel events.",
    permissions: ["events.view", "events.manage"],
  },
  money: {
    label: "Payments & invoices",
    opens: "Transactions, outstanding, invoices, everyone's expenses, vendors and payouts, reports, invoice settings, and money on Home and events.",
    permissions: ["finance.view", "bills.manage", "payments.record", "expenses.approve"],
  },
  team: {
    label: "Team",
    opens: "Inviting people, changing roles, and running everyone's tasks.",
    permissions: ["members.invite", "members.manage"],
  },
  settings: {
    label: "Business settings",
    opens: "The business profile, your lists, your own fields and points rules.",
    permissions: ["workspace.update"],
  },
};

/** How strong a permission is: looking, doing the work, running things, or owner only. */
type Kind = "view" | "work" | "manage" | "owner";

const KIND: Record<Permission, Kind> = {
  "workspace.update": "manage",
  "members.view": "view",
  "members.invite": "manage",
  "members.manage": "manage",
  "members.hr": "owner",
  "finance.view": "view",
  "billing.manage": "owner",
  "leads.work": "work",
  "leads.view_all": "manage",
  "leads.assign": "manage",
  "leads.delete": "manage",
  "clients.view": "view",
  "clients.manage": "work",
  "catalogue.manage": "manage",
  "quotes.view": "view",
  "quotes.manage": "work",
  "events.view": "view",
  "events.manage": "manage",
  "bills.manage": "work",
  "payments.record": "work",
  "expenses.submit": "work",
  "expenses.approve": "work",
  "tasks.manage": "manage",
  "tasks.work": "work",
  "team.review": "manage",
};

/** The roles whose screens come from a department. The owner has everything; freelancers stay as they are. */
type ScreenRole = "manager" | "staff" | "accountant";
const isScreenRole = (role: Role): role is ScreenRole => role === "manager" || role === "staff" || role === "accountant";

const HOLDS: Record<ScreenRole, readonly Kind[]> = {
  manager: ["view", "work", "manage"],
  staff: ["view", "work"],
  accountant: ["view"],
};

/** What everyone in a department gets, whatever its screens. */
const ALWAYS: Record<ScreenRole, readonly Permission[]> = {
  manager: ["members.view", "tasks.work", "expenses.submit", "tasks.manage", "team.review"],
  staff: ["members.view", "tasks.work", "expenses.submit"],
  accountant: ["members.view"],
};

/** The screens each built-in department starts with. The owner can change them. */
export const DEPARTMENT_DEFAULTS: Record<string, readonly Area[]> = {
  admin: AREAS,
  manager: AREAS,
  sales: ["leads", "quotes", "events"],
  accountant: ["money", "clients", "events"],
};

/** A department the owner adds starts with the events, like most of a wedding team. */
export const NEW_DEPARTMENT_AREAS: readonly Area[] = ["events"];

export function startingAreas(departmentKey: string): Area[] {
  return [...(DEPARTMENT_DEFAULTS[departmentKey] ?? NEW_DEPARTMENT_AREAS)];
}

export const isArea = (v: unknown): v is Area => typeof v === "string" && (AREAS as readonly string[]).includes(v);

/** Known screens only, in the usual order, without repeats. */
export function cleanAreas(list: readonly unknown[] | null | undefined): Area[] {
  const set = new Set((list ?? []).filter(isArea));
  return AREAS.filter((a) => set.has(a));
}

/** What a screen gives someone with this role. Empty when the role can't use it. */
export function areaGives(role: Role, area: Area): Permission[] {
  if (role === "owner") return [...AREA_INFO[area].permissions];
  if (!isScreenRole(role)) return [];
  return AREA_INFO[area].permissions.filter((p) => HOLDS[role].includes(KIND[p]));
}

/** The least role that gets something from a screen, for "Needs the Manager role". */
export function areaNeeds(area: Area): Role {
  if (areaGives("accountant", area).length) return "accountant";
  if (areaGives("staff", area).length) return "staff";
  return "manager";
}

export interface AccessInput {
  role: Role;
  /** Their department's key, if they're in one */
  department: string | null;
  /** False for people placed before departments decided screens, until the owner turns it on */
  departmentOn: boolean;
  /** The department's screens as the owner set them; null means its starting screens */
  departmentAreas: readonly string[] | null;
  /** Screens the owner switched on for this person */
  extraAreas: readonly string[] | null;
}

export interface ResolvedAccess extends Access {
  permissions: Permission[];
  /** The screens they can open, worked out from what they can do */
  areas: Area[];
  /** Where their screens come from: everything (the owner), their role's usual access, or their department */
  source: "owner" | "role" | "department";
  /** Screens from their department that their role can use */
  departmentAreas: Area[];
  /** Extra screens the owner switched on that their role can use and their department doesn't give */
  extraAreas: Area[];
}

/** The screens someone can open, from their permissions. */
export function areasOf(permissions: readonly Permission[]): Area[] {
  return AREAS.filter((a) => AREA_INFO[a].permissions.some((p) => permissions.includes(p)));
}

/** Works out what someone can do. The API calls this on every request. */
export function resolveAccess(input: AccessInput): ResolvedAccess {
  const { role } = input;
  if (role === "owner") {
    const permissions = [...PERMISSIONS];
    return { role, permissions, areas: [...AREAS], source: "owner", departmentAreas: [], extraAreas: [] };
  }
  if (!isScreenRole(role)) {
    const permissions = [...ROLE_GRANTS[role]];
    return { role, permissions, areas: areasOf(permissions), source: "role", departmentAreas: [], extraAreas: [] };
  }

  const usesDepartment = input.department !== null && input.departmentOn;
  const fromDepartment = usesDepartment
    ? cleanAreas(input.departmentAreas ?? startingAreas(input.department!)).filter((a) => areaGives(role, a).length > 0)
    : [];
  const extra = cleanAreas(input.extraAreas).filter((a) => !fromDepartment.includes(a) && areaGives(role, a).length > 0);

  const set = new Set<Permission>(usesDepartment ? ALWAYS[role] : ROLE_GRANTS[role]);
  for (const a of [...fromDepartment, ...extra]) for (const p of areaGives(role, a)) set.add(p);
  // Never through screens: pay and the plan stay with the owner.
  set.delete("members.hr");
  set.delete("billing.manage");
  const permissions = PERMISSIONS.filter((p) => set.has(p));
  return {
    role,
    permissions,
    areas: areasOf(permissions),
    source: usesDepartment ? "department" : "role",
    departmentAreas: fromDepartment,
    extraAreas: extra,
  };
}

/** The permissions `wanted` has that `actor` doesn't: "you can't give more than you have". */
export function beyond(actor: Access, wanted: readonly Permission[]): Permission[] {
  return wanted.filter((p) => !actor.permissions.includes(p));
}
