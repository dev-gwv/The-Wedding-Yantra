import { can } from "@wedding-yantra/core";
import type { Db } from "../../db.js";
import { forbidden } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

/**
 * "Download all my data": the business's own records, as one JSON file the owner can keep
 * or take elsewhere (and what the privacy policy promises under India's DPDP Act).
 *
 * Every table here has a workspace_id, and only this workspace's rows are read. Columns are
 * read from the database itself, so new columns are included without changing this file,
 * except anything secret: share links, portal links, tokens, hashes and file storage keys.
 */
const SECTIONS: { key: string; table: string }[] = [
  { key: "pipelineStages", table: "pipeline_stages" },
  { key: "leads", table: "leads" },
  { key: "leadActivities", table: "lead_activities" },
  { key: "clients", table: "clients" },
  { key: "clientContacts", table: "client_contacts" },
  { key: "events", table: "events" },
  { key: "eventFunctions", table: "event_functions" },
  { key: "quotes", table: "quotes" },
  { key: "quoteItems", table: "quote_items" },
  { key: "bills", table: "bills" },
  { key: "billItems", table: "bill_items" },
  { key: "billInstalments", table: "bill_instalments" },
  { key: "payments", table: "payments" },
  { key: "expenses", table: "expenses" },
  { key: "vendors", table: "vendors" },
  { key: "payouts", table: "payouts" },
  { key: "tasks", table: "tasks" },
  { key: "deliverables", table: "deliverables" },
  { key: "venues", table: "venues" },
  { key: "services", table: "catalogue_items" },
  { key: "packages", table: "service_packages" },
  { key: "packageItems", table: "service_package_items" },
];

/** Columns never exported: anything that opens a link, signs someone in or locates a stored file. */
const SECRET_COLUMN = /token|hash|secret|password|storage_key|checkout_url/i;

type Row = Record<string, unknown>;

/** The columns of each table that are safe to export, read once per export. */
async function exportableColumns(db: Db, tables: string[]): Promise<Map<string, string[]>> {
  const { rows } = await db.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`,
    [tables],
  );
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (SECRET_COLUMN.test(r.column_name)) continue;
    const list = out.get(r.table_name) ?? [];
    list.push(r.column_name);
    out.set(r.table_name, list);
  }
  return out;
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** This workspace's live rows of one table (deleted ones are left out), oldest first. */
async function tableRows(db: Db, table: string, columns: string[], workspaceId: string): Promise<Row[]> {
  // Only tables that really belong to a business are read.
  if (!columns.includes("workspace_id")) return [];
  const where = [`workspace_id = $1`];
  if (columns.includes("deleted_at")) where.push("deleted_at IS NULL");
  const order = columns.includes("created_at") ? " ORDER BY created_at, 1" : columns.includes("position") ? " ORDER BY position" : "";
  const { rows } = await db.query<Row>(
    `SELECT ${columns.map(ident).join(", ")} FROM ${ident(table)} WHERE ${where.join(" AND ")}${order}`,
    [workspaceId],
  );
  return rows;
}

export interface WorkspaceExport {
  fileName: string;
  data: Record<string, unknown>;
}

/** `Riya Makeup Studio` -> `riya-makeup-studio` */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "business";
}

/** Today's date in the business's own time zone, as YYYY-MM-DD. */
function today(timezone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Asia/Kolkata" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  }
}

export async function exportWorkspace(db: Db, ctx: MemberContext): Promise<WorkspaceExport> {
  if (!can(ctx, "billing.manage")) throw forbidden("Only the owner can download all the business's data");

  const columns = await exportableColumns(db, ["workspaces", ...SECTIONS.map((s) => s.table)]);
  const workspaceColumns = (columns.get("workspaces") ?? []).filter((c) => c !== "deleted_at");
  const ws = await db.query<Row>(`SELECT ${workspaceColumns.map(ident).join(", ")} FROM workspaces WHERE id = $1`, [ctx.workspaceId]);
  const workspace = ws.rows[0] ?? {};

  // People: who they are and what they do here; never their sign-in details or bank/ID numbers.
  const members = await db.query<Row>(
    `SELECT u.name, u.phone, m.role, md.department, md.designation, m.created_at AS joined_at
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN member_details md ON md.membership_id = m.id
      WHERE m.workspace_id = $1 AND m.removed_at IS NULL
      ORDER BY m.created_at`,
    [ctx.workspaceId],
  );

  const data: Record<string, unknown> = {
    format: "wedding-yantra-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace,
    members: members.rows,
  };
  for (const section of SECTIONS) {
    data[section.key] = await tableRows(db, section.table, columns.get(section.table) ?? [], ctx.workspaceId);
  }

  const name = typeof workspace.name === "string" ? workspace.name : "business";
  const timezone = typeof workspace.timezone === "string" ? workspace.timezone : null;
  return { fileName: `wedding-yantra-${slugify(name)}-${today(timezone)}.json`, data };
}
