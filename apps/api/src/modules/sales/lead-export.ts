import { EVENT_LABELS, SOURCE_LABELS, type LeadExportFile, type LeadExportQuery } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { toCsv, toXlsx, type Cell } from "../../lib/spreadsheet.js";
import type { MemberContext } from "../auth/guard.js";
import { scopeCondition } from "./leads.js";

const HEADER = [
  "Enquired on",
  "Name",
  "Mobile",
  "Email",
  "Event",
  "Event date",
  "City",
  "Venue",
  "Guests",
  "Budget (₹)",
  "What they said",
  "Came from",
  "Partner / QR code",
  "Stage",
  "Handled by",
  "Next follow-up",
];
const WIDTHS = [17, 22, 13, 24, 16, 12, 14, 20, 8, 12, 40, 16, 22, 14, 18, 17];

/** +919876543210 -> 9876543210: readable, and a "+" at the start would look like a formula. */
const plainPhone = (phone: string | null) => (phone ? (phone.startsWith("+91") ? phone.slice(3) : phone.replace(/^\+/, "")) : null);

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Every lead that matches, newest first, with what a salesperson needs to call them back. */
export async function exportLeads(db: Queryable, ctx: MemberContext, query: LeadExportQuery & { format: "xlsx" | "csv" }): Promise<LeadExportFile> {
  const params: unknown[] = [ctx.workspaceId];
  const where = ["l.workspace_id = $1", "l.deleted_at IS NULL", scopeCondition(ctx, params)];
  const add = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (query.stageId) where.push(`l.stage_id = ${add(query.stageId)}`);
  if (query.partnerId) where.push(`l.partner_id = ${add(query.partnerId)}`);
  if (query.source) where.push(`l.source = ${add(query.source)}`);
  if (query.q) {
    const byName = `l.name ILIKE ${add(`%${query.q.replace(/[%_\\]/g, "\\$&")}%`)}`;
    const digits = query.q.replace(/\D/g, "");
    where.push(digits.length >= 3 ? `(${byName} OR l.phone LIKE ${add(`%${digits}%`)})` : byName);
  }

  const { rows } = await db.query<{
    enquired: string;
    name: string;
    phone: string | null;
    email: string | null;
    event_type: keyof typeof EVENT_LABELS | null;
    event_date: string | null;
    city: string | null;
    venue: string | null;
    guest_count: number | null;
    budget: string | null;
    requirements: string | null;
    source: keyof typeof SOURCE_LABELS;
    partner_name: string | null;
    stage_name: string;
    assigned_name: string | null;
    follow_up: string | null;
  }>(
    `SELECT to_char(l.created_at AT TIME ZONE w.timezone, 'DD-MM-YYYY HH24:MI') AS enquired,
            l.name, l.phone, l.email, l.event_type, to_char(l.event_date, 'DD-MM-YYYY') AS event_date,
            l.city, l.venue, l.guest_count, l.budget, l.requirements, l.source,
            pa.name AS partner_name, s.name AS stage_name, au.name AS assigned_name,
            to_char(l.next_follow_up_at AT TIME ZONE w.timezone, 'DD-MM-YYYY HH24:MI') AS follow_up
       FROM leads l
       JOIN pipeline_stages s ON s.id = l.stage_id
       JOIN workspaces w ON w.id = l.workspace_id
       LEFT JOIN users au ON au.id = l.assigned_to
       LEFT JOIN partners pa ON pa.id = l.partner_id AND pa.workspace_id = l.workspace_id
      WHERE ${where.join(" AND ")}
      ORDER BY l.created_at DESC
      LIMIT 20000`,
    params,
  );

  const data: Cell[][] = rows.map((r) => [
    r.enquired,
    r.name,
    plainPhone(r.phone),
    r.email,
    r.event_type ? (EVENT_LABELS[r.event_type] ?? r.event_type) : null,
    r.event_date,
    r.city,
    r.venue,
    r.guest_count,
    r.budget === null ? null : Number(r.budget),
    r.requirements,
    SOURCE_LABELS[r.source] ?? r.source,
    r.partner_name,
    r.stage_name,
    r.assigned_name,
    r.follow_up,
  ]);

  // Named after what was asked for: a partner's QR code, a source, or everything.
  const business = (await db.query<{ name: string; today: string }>(
    `SELECT name, to_char(now() AT TIME ZONE timezone, 'YYYY-MM-DD') AS today FROM workspaces WHERE id = $1`,
    [ctx.workspaceId],
  )).rows[0];
  let what = "leads";
  if (query.partnerId) {
    const partner = (await db.query<{ name: string }>(`SELECT name FROM partners WHERE id = $1 AND workspace_id = $2`, [query.partnerId, ctx.workspaceId])).rows[0];
    what = `leads-${slug(partner?.name ?? "partner") || "partner"}`;
  } else if (query.source) what = `leads-${slug(SOURCE_LABELS[query.source] ?? query.source)}`;
  const base = [slug(business?.name ?? ""), what, business?.today].filter(Boolean).join("-");

  if (query.format === "csv")
    return { filename: `${base}.csv`, contentType: "text/csv;charset=utf-8", data: Buffer.from(toCsv(HEADER, data), "utf8").toString("base64"), rows: data.length };
  return {
    filename: `${base}.xlsx`,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: toXlsx({ name: "Leads", header: HEADER, rows: data, widths: WIDTHS }).toString("base64"),
    rows: data.length,
  };
}
