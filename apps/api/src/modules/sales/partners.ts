import { randomInt } from "node:crypto";
import { can } from "@wedding-yantra/core";
import { maskedPhone, type Partner, type PartnerLeadStatus, type PartnerPage, type PartnerSummary } from "@wedding-yantra/types";
import type { Db, Queryable } from "../../db.js";
import { logActivity } from "../../lib/activity.js";
import { randomToken } from "../../lib/crypto.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { logoPath } from "../files/logo.js";
import { listLeads } from "./leads.js";

/**
 * Partner QR codes. A partner (a boutique, jeweller, venue) gets their own code on the
 * enquiry form; enquiries through it are theirs, and they can see them on their own page.
 * Owners and managers run them.
 */
const requireManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "leads.view_all")) throw forbidden("Only the owner or a manager can manage partners");
};

interface PartnerRow {
  id: string;
  name: string;
  label: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  phone: string | null;
  notes: string | null;
  code: string;
  view_token: string | null;
  show_phone: boolean;
  scans: number;
  archived_at: Date | null;
  enquiries: string;
  booked: string;
  last_enquiry_at: Date | null;
}

const SELECT = `
  SELECT p.id, p.name, p.label, p.vendor_id, v.name AS vendor_name, p.phone, p.notes, p.code, p.view_token,
         p.show_phone, p.scans, p.archived_at,
         count(l.id) AS enquiries,
         count(l.id) FILTER (WHERE s.kind = 'won') AS booked,
         max(l.created_at) AS last_enquiry_at
    FROM partners p
    LEFT JOIN vendors v ON v.id = p.vendor_id
    LEFT JOIN leads l ON l.partner_id = p.id AND l.deleted_at IS NULL
    LEFT JOIN pipeline_stages s ON s.id = l.stage_id`;
const GROUP = "GROUP BY p.id, v.name";

const toSummary = (r: PartnerRow): PartnerSummary => ({
  id: r.id,
  name: r.name,
  label: r.label,
  vendorId: r.vendor_id,
  vendorName: r.vendor_name,
  phone: r.phone,
  code: r.code,
  sharing: r.view_token !== null,
  showPhone: r.show_phone,
  scans: r.scans,
  enquiries: Number(r.enquiries),
  booked: Number(r.booked),
  lastEnquiryAt: r.last_enquiry_at?.toISOString() ?? null,
  archived: r.archived_at !== null,
});

/** Busiest partners first. Archived ones only when asked. */
export async function listPartners(db: Queryable, ctx: MemberContext, archived = false): Promise<PartnerSummary[]> {
  requireManage(ctx);
  const { rows } = await db.query<PartnerRow>(
    `${SELECT} WHERE p.workspace_id = $1 AND p.archived_at IS ${archived ? "NOT NULL" : "NULL"} ${GROUP}
      ORDER BY count(l.id) DESC, p.scans DESC, lower(p.name)`,
    [ctx.workspaceId],
  );
  return rows.map(toSummary);
}

export async function getPartner(db: Db, ctx: MemberContext, id: string): Promise<Partner> {
  requireManage(ctx);
  const { rows } = await db.query<PartnerRow>(`${SELECT} WHERE p.id = $1 AND p.workspace_id = $2 ${GROUP}`, [id, ctx.workspaceId]);
  const r = rows[0];
  if (!r) throw notFound("This partner");
  const leads = await listLeads(db, ctx, { partnerId: id });
  return {
    ...toSummary(r),
    notes: r.notes,
    viewToken: r.view_token,
    leads: [...leads.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

// No 0/o, 1/l/i: people sometimes type the link by hand.
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

export interface PartnerFields {
  name?: string;
  label?: string | null;
  vendorId?: string | null;
  phone?: string | null;
  notes?: string | null;
  showPhone?: boolean;
  archived?: boolean;
}
const COLUMNS: [keyof PartnerFields, string][] = [
  ["name", "name"],
  ["label", "label"],
  ["vendorId", "vendor_id"],
  ["phone", "phone"],
  ["notes", "notes"],
  ["showPhone", "show_phone"],
];

async function checkVendor(db: Queryable, workspaceId: string, vendorId: string | null | undefined) {
  if (!vendorId) return;
  const { rowCount } = await db.query(`SELECT 1 FROM vendors WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL`, [vendorId, workspaceId]);
  if (!rowCount) throw new AppError(400, "VALIDATION_ERROR", "Choose a vendor from your list", { vendorId: "Choose a vendor from your list" });
}

async function checkName(db: Queryable, workspaceId: string, name: string | undefined, id?: string) {
  if (!name) return;
  const { rows } = await db.query<{ archived: boolean }>(
    `SELECT archived_at IS NOT NULL AS archived FROM partners WHERE workspace_id = $1 AND lower(name) = lower($2) AND id IS DISTINCT FROM $3 LIMIT 1`,
    [workspaceId, name, id ?? null],
  );
  if (rows[0]) {
    const message = rows[0].archived ? "An archived partner has this name. Bring them back instead." : "You already have a partner with this name";
    throw new AppError(409, "DUPLICATE_PARTNER", message, { name: message });
  }
}

export async function createPartner(db: Db, ctx: MemberContext, input: PartnerFields & { name: string }): Promise<Partner> {
  requireManage(ctx);
  await checkVendor(db, ctx.workspaceId, input.vendorId);
  await checkName(db, ctx.workspaceId, input.name);
  const cols = COLUMNS.filter(([key]) => input[key] !== undefined);
  // A fresh code, and the partner's page switched on from the start.
  for (let attempt = 0; ; attempt++) {
    try {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO partners (workspace_id, created_by, code, view_token${cols.map(([, c]) => `, ${c}`).join("")})
         VALUES ($1, $2, $3, $4${cols.map((_, i) => `, $${i + 5}`).join("")}) RETURNING id`,
        [ctx.workspaceId, ctx.userId, newCode(), randomToken(), ...cols.map(([key]) => input[key])],
      );
      const id = rows[0]!.id;
      await logActivity(db, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: "partner.added", entityType: "partner", entityId: id, meta: { name: input.name } });
      return getPartner(db, ctx, id);
    } catch (err) {
      if ((err as { code?: string }).code === "23505" && attempt < 5) continue;
      throw err;
    }
  }
}

export async function updatePartner(db: Db, ctx: MemberContext, id: string, input: PartnerFields): Promise<Partner> {
  requireManage(ctx);
  const current = await db.query<{ name: string; archived_at: Date | null }>(`SELECT name, archived_at FROM partners WHERE id = $1 AND workspace_id = $2`, [
    id,
    ctx.workspaceId,
  ]);
  const was = current.rows[0];
  if (!was) throw notFound("This partner");
  await checkVendor(db, ctx.workspaceId, input.vendorId);
  await checkName(db, ctx.workspaceId, input.name, id);

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of COLUMNS) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (input.archived !== undefined) {
    values.push(input.archived ? (was.archived_at ?? new Date()) : null);
    sets.push(`archived_at = $${values.length}`);
  }
  if (sets.length) {
    values.push(id, ctx.workspaceId);
    await db.query(`UPDATE partners SET ${sets.join(", ")} WHERE id = $${values.length - 1} AND workspace_id = $${values.length}`, values);
    const base = { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, entityType: "partner", entityId: id };
    const name = input.name ?? was.name;
    const archiving = input.archived !== undefined && input.archived !== (was.archived_at !== null);
    if (archiving) await logActivity(db, { ...base, action: input.archived ? "partner.archived" : "partner.restored", meta: { name } });
    if (sets.length > (input.archived !== undefined ? 1 : 0)) await logActivity(db, { ...base, action: "partner.updated", meta: { name } });
  }
  return getPartner(db, ctx, id);
}

/** Their page link: a new one (the old one stops working), or none (sharing stopped). */
export async function setPartnerSharing(db: Db, ctx: MemberContext, id: string, on: boolean): Promise<Partner> {
  requireManage(ctx);
  const { rows } = await db.query<{ name: string }>(
    `UPDATE partners SET view_token = $3 WHERE id = $1 AND workspace_id = $2 RETURNING name`,
    [id, ctx.workspaceId, on ? randomToken() : null],
  );
  if (!rows[0]) throw notFound("This partner");
  await logActivity(db, {
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    action: on ? "partner.shared" : "partner.sharing_stopped",
    entityType: "partner",
    entityId: id,
    meta: { name: rows[0].name },
  });
  return getPartner(db, ctx, id);
}

/** A live partner with this code in the business, for crediting an enquiry. */
export async function findPartnerByCode(db: Queryable, workspaceId: string, code: string | undefined) {
  const clean = code?.trim().toLowerCase();
  if (!clean || !/^[a-z0-9]{6,12}$/.test(clean)) return null;
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM partners WHERE workspace_id = $1 AND code = $2 AND archived_at IS NULL`,
    [workspaceId, clean],
  );
  return rows[0] ?? null;
}

/**
 * What the partner sees at /p/<token>: the enquiries their code brought, newest first,
 * with where each one stands. No money, and client numbers masked unless the business allows.
 */
export async function getPartnerPage(db: Db, token: string): Promise<PartnerPage> {
  const found = await db.query<{
    id: string;
    workspace_id: string;
    name: string;
    show_phone: boolean;
    scans: number;
    business: string;
    icon: string;
    city: string;
    logo_file_id: string | null;
  }>(
    `SELECT p.id, p.workspace_id, p.name, p.show_phone, p.scans, w.name AS business, bt.icon, w.city, w.logo_file_id
       FROM partners p
       JOIN workspaces w ON w.id = p.workspace_id AND w.deleted_at IS NULL
       JOIN business_types bt ON bt.id = w.business_type_id
      WHERE p.view_token = $1 AND p.archived_at IS NULL`,
    [token],
  );
  const p = found.rows[0];
  if (!p) throw notFound("This page");

  const { rows } = await db.query<{
    name: string;
    phone: string | null;
    created_at: Date;
    event_type: PartnerPage["leads"][number]["eventType"];
    event_date: string | null;
    kind: "open" | "won" | "lost";
    first_open: boolean;
  }>(
    `SELECT l.name, l.phone, l.created_at, l.event_type, l.event_date::text AS event_date, s.kind,
            s.position = (SELECT min(position) FROM pipeline_stages WHERE workspace_id = l.workspace_id AND kind = 'open') AS first_open
       FROM leads l JOIN pipeline_stages s ON s.id = l.stage_id
      WHERE l.partner_id = $1 AND l.workspace_id = $2 AND l.deleted_at IS NULL
      ORDER BY l.created_at DESC
      LIMIT 500`,
    [p.id, p.workspace_id],
  );
  const status = (r: (typeof rows)[number]): PartnerLeadStatus =>
    r.kind === "won" ? "booked" : r.kind === "lost" ? "not_booked" : r.first_open ? "new" : "in_talks";

  return {
    businessName: p.business,
    businessTypeIcon: p.icon,
    businessCity: p.city,
    logoUrl: logoPath(p.workspace_id, p.logo_file_id),
    partnerName: p.name,
    scans: p.scans,
    enquiries: rows.length,
    booked: rows.filter((r) => r.kind === "won").length,
    leads: rows.map((r) => ({
      name: r.name,
      phone: p.show_phone ? r.phone : maskedPhone(r.phone),
      enquiredOn: r.created_at.toISOString(),
      eventType: r.event_type,
      eventDate: r.event_date,
      status: status(r),
    })),
  };
}
