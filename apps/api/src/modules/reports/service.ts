import { PAYMENT_METHOD_LABELS, receiptNumber, round2, stateName, type PaymentMethod } from "@wedding-yantra/core";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS,
  type ExpenseCategory,
  type ExpenseStatus,
  type ExportFile,
  type ExportKind,
  type LeadSource,
  type MonthReport,
} from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import type { MemberContext } from "../auth/guard.js";
import { requireMoneyView } from "../money/access.js";
import { moneyOverview } from "../money/dues.js";

const n = (v: string | null | undefined) => Number(v ?? 0);

/** One month of the business: cash in and out, sales for GST, profit, and where work came from. */
export async function monthReport(db: Queryable, ctx: MemberContext, month: string): Promise<MonthReport> {
  requireMoneyView(ctx);
  const ws = ctx.workspaceId;
  const inMonth = (column: string) => `to_char(${column}, 'YYYY-MM') = $2`;

  const [received, spent, sales, bySource, byService, byMember, byCategory, byMethod, overview] = await Promise.all([
    db.query<{ total: string }>(
      `SELECT coalesce(sum(amount), 0) AS total FROM payments WHERE workspace_id = $1 AND deleted_at IS NULL AND ${inMonth("paid_on")}`,
      [ws, month],
    ),
    db.query<{ total: string }>(
      `SELECT coalesce(sum(amount), 0) AS total FROM expenses
        WHERE workspace_id = $1 AND deleted_at IS NULL AND status = 'approved' AND ${inMonth("spent_on")}`,
      [ws, month],
    ),
    db.query<{ bills: string; taxable: string; cgst: string; sgst: string; igst: string; tax: string; total: string }>(
      `SELECT count(*) AS bills, coalesce(sum(taxable), 0) AS taxable, coalesce(sum(cgst), 0) AS cgst,
              coalesce(sum(sgst), 0) AS sgst, coalesce(sum(igst), 0) AS igst, coalesce(sum(tax), 0) AS tax,
              coalesce(sum(total), 0) AS total
         FROM bills WHERE workspace_id = $1 AND status = 'issued' AND ${inMonth("issue_date")}`,
      [ws, month],
    ),
    db.query<{ source: LeadSource | "direct"; taxable: string; bills: string }>(
      `SELECT coalesce(l.source, 'direct') AS source, sum(b.taxable) AS taxable, count(*) AS bills
         FROM bills b
         LEFT JOIN events e ON e.id = b.event_id
         LEFT JOIN leads l ON l.id = e.lead_id
        WHERE b.workspace_id = $1 AND b.status = 'issued' AND ${inMonth("b.issue_date")}
        GROUP BY 1 ORDER BY 2 DESC`,
      [ws, month],
    ),
    db.query<{ name: string; quantity: string; taxable: string }>(
      `SELECT bi.name, sum(bi.quantity) AS quantity, sum(bi.taxable) AS taxable
         FROM bill_items bi JOIN bills b ON b.id = bi.bill_id
        WHERE b.workspace_id = $1 AND b.status = 'issued' AND ${inMonth("b.issue_date")}
        GROUP BY bi.name ORDER BY 3 DESC LIMIT 8`,
      [ws, month],
    ),
    db.query<{ name: string | null; from_lead: boolean; taxable: string; bills: string }>(
      `SELECT u.name, l.id IS NOT NULL AS from_lead, sum(b.taxable) AS taxable, count(*) AS bills
         FROM bills b
         LEFT JOIN events e ON e.id = b.event_id
         LEFT JOIN leads l ON l.id = e.lead_id
         LEFT JOIN users u ON u.id = coalesce(l.assigned_to, l.created_by)
        WHERE b.workspace_id = $1 AND b.status = 'issued' AND ${inMonth("b.issue_date")}
        GROUP BY u.name, l.id IS NOT NULL ORDER BY 3 DESC`,
      [ws, month],
    ),
    db.query<{ category: ExpenseCategory; total: string }>(
      `SELECT category, sum(amount) AS total FROM expenses
        WHERE workspace_id = $1 AND deleted_at IS NULL AND status = 'approved' AND ${inMonth("spent_on")}
        GROUP BY category ORDER BY 2 DESC`,
      [ws, month],
    ),
    db.query<{ method: PaymentMethod; total: string }>(
      `SELECT method, sum(amount) AS total FROM payments
        WHERE workspace_id = $1 AND deleted_at IS NULL AND ${inMonth("paid_on")}
        GROUP BY method ORDER BY 2 DESC`,
      [ws, month],
    ),
    moneyOverview(db, ctx),
  ]);

  const s = sales.rows[0]!;
  const cashIn = n(received.rows[0]?.total);
  const cashOut = n(spent.rows[0]?.total);
  const earned = n(s.taxable);

  // Bills from enquiries count for whoever handled them; the rest are grouped as direct.
  const members = new Map<string, { name: string; taxable: number; bills: number }>();
  for (const r of byMember.rows) {
    const name = r.from_lead ? (r.name ?? "Someone who left") : "Not from an enquiry";
    const m = members.get(name) ?? { name, taxable: 0, bills: 0 };
    members.set(name, { name, taxable: round2(m.taxable + n(r.taxable)), bills: m.bills + Number(r.bills) });
  }

  return {
    month,
    cash: { received: cashIn, spent: cashOut, net: round2(cashIn - cashOut) },
    sales: {
      bills: Number(s.bills),
      taxable: earned,
      cgst: n(s.cgst),
      sgst: n(s.sgst),
      igst: n(s.igst),
      tax: n(s.tax),
      total: n(s.total),
    },
    profit: { earned, spent: cashOut, profit: round2(earned - cashOut) },
    toCollect: overview.toCollect,
    overdue: overview.overdue,
    bySource: bySource.rows.map((r) => ({ source: r.source, taxable: n(r.taxable), bills: Number(r.bills) })),
    byService: byService.rows.map((r) => ({ name: r.name, quantity: n(r.quantity), taxable: n(r.taxable) })),
    byMember: [...members.values()].sort((a, b) => b.taxable - a.taxable),
    byCategory: byCategory.rows.map((r) => ({ category: r.category, total: n(r.total) })),
    receivedByMethod: byMethod.rows.map((r) => ({ method: r.method, total: n(r.total) })),
  };
}

// ---------------------------------------------------------------------------
// Spreadsheets for the CA
// ---------------------------------------------------------------------------

type Cell = string | number | null;

/**
 * CSV that Excel and Google Sheets open cleanly. Text that looks like a formula gets a
 * leading apostrophe, so a client named "=HYPERLINK(...)" can't run anything.
 */
function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    if (v === null) return "";
    if (typeof v === "number") return v.toFixed(2);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return `\uFEFF${[header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}

/** +919876543210 -> 9876543210: readable, and a "+" at the start would look like a formula. */
const plainPhone = (phone: string | null) => (phone ? (phone.startsWith("+91") ? phone.slice(3) : phone.replace(/^\+/, "")) : null);

/** 2026-09-25 -> 25-09-2026, the way Indian accountants read dates. */
const indianDate = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "wedding-yantra";

export async function exportMonth(db: Queryable, ctx: MemberContext, kind: ExportKind, month: string): Promise<ExportFile> {
  requireMoneyView(ctx);
  const ws = ctx.workspaceId;
  const business = (await db.query<{ name: string }>(`SELECT name FROM workspaces WHERE id = $1`, [ws])).rows[0]?.name ?? "";
  const filename = `${slug(business)}-${kind}-${month}.csv`;

  if (kind === "bills") {
    const { rows } = await db.query<{
      issue_date: string;
      number: string;
      status: string;
      name: string;
      phone: string | null;
      gstin: string | null;
      place_of_supply: string | null;
      taxable: string;
      cgst: string;
      sgst: string;
      igst: string;
      round_off: string;
      total: string;
      received: string;
      event_title: string | null;
    }>(
      `SELECT b.issue_date::text AS issue_date, b.number, b.status, b.bill_to_name AS name, b.bill_to_phone AS phone,
              b.bill_to_gstin AS gstin, b.place_of_supply, b.taxable, b.cgst, b.sgst, b.igst, b.round_off, b.total,
              coalesce((SELECT sum(p.amount) FROM payments p WHERE p.bill_id = b.id AND p.deleted_at IS NULL), 0) AS received,
              e.title AS event_title
         FROM bills b LEFT JOIN events e ON e.id = b.event_id
        WHERE b.workspace_id = $1 AND to_char(b.issue_date, 'YYYY-MM') = $2
        ORDER BY b.issue_date, b.seq`,
      [ws, month],
    );
    // Cancelled bills stay in the list (GST numbering has no gaps) with zero amounts.
    const header = [
      "Bill date", "Bill number", "Status", "Client", "Client phone", "Client GSTIN", "Place of supply",
      "Taxable value", "CGST", "SGST", "IGST", "Round off", "Total", "Received", "Balance due", "Event",
    ];
    const data = rows.map((r) => {
      const live = r.status === "issued";
      const money = (v: string) => (live ? n(v) : 0);
      return [
        indianDate(r.issue_date),
        r.number,
        live ? "Issued" : "Cancelled",
        r.name,
        plainPhone(r.phone),
        r.gstin,
        r.place_of_supply ? `${r.place_of_supply} ${stateName(r.place_of_supply) ?? ""}`.trim() : null,
        money(r.taxable),
        money(r.cgst),
        money(r.sgst),
        money(r.igst),
        money(r.round_off),
        money(r.total),
        money(r.received),
        live ? Math.max(round2(n(r.total) - n(r.received)), 0) : 0,
        r.event_title,
      ];
    });
    return { filename, content: toCsv(header, data), rows: data.length };
  }

  if (kind === "payments") {
    const { rows } = await db.query<{
      paid_on: string;
      number: number;
      client: string | null;
      bill_number: string | null;
      method: PaymentMethod;
      reference: string | null;
      amount: string;
      recorded_by: string | null;
    }>(
      `SELECT p.paid_on::text AS paid_on, p.number, coalesce(c.name, b.bill_to_name) AS client, b.number AS bill_number,
              p.method, p.reference, p.amount, u.name AS recorded_by
         FROM payments p
         LEFT JOIN bills b ON b.id = p.bill_id
         LEFT JOIN clients c ON c.id = p.client_id
         LEFT JOIN users u ON u.id = p.created_by
        WHERE p.workspace_id = $1 AND p.deleted_at IS NULL AND to_char(p.paid_on, 'YYYY-MM') = $2
        ORDER BY p.paid_on, p.number`,
      [ws, month],
    );
    const header = ["Date", "Receipt number", "Client", "Bill number", "Paid by", "Reference", "Amount", "Recorded by"];
    const data = rows.map((r) => [
      indianDate(r.paid_on),
      receiptNumber(r.number),
      r.client,
      r.bill_number,
      PAYMENT_METHOD_LABELS[r.method],
      r.reference,
      n(r.amount),
      r.recorded_by,
    ]);
    return { filename, content: toCsv(header, data), rows: data.length };
  }

  const { rows } = await db.query<{
    spent_on: string;
    category: ExpenseCategory;
    paid_to: string | null;
    event_title: string | null;
    method: PaymentMethod | null;
    amount: string;
    status: ExpenseStatus;
    added_by: string | null;
    approved_by: string | null;
    note: string | null;
    has_photo: boolean;
  }>(
    `SELECT x.spent_on::text AS spent_on, x.category, x.paid_to, e.title AS event_title, x.method, x.amount, x.status,
            su.name AS added_by, ru.name AS approved_by, x.note, x.receipt_file_id IS NOT NULL AS has_photo
       FROM expenses x
       LEFT JOIN events e ON e.id = x.event_id
       LEFT JOIN users su ON su.id = x.submitted_by
       LEFT JOIN users ru ON ru.id = x.reviewed_by
      WHERE x.workspace_id = $1 AND x.deleted_at IS NULL AND to_char(x.spent_on, 'YYYY-MM') = $2
      ORDER BY x.spent_on, x.created_at`,
    [ws, month],
  );
  const header = ["Date", "Category", "Paid to", "For event", "Paid by", "Amount", "Status", "Added by", "Approved by", "Note", "Bill photo"];
  const data = rows.map((r) => [
    indianDate(r.spent_on),
    EXPENSE_CATEGORY_LABELS[r.category],
    r.paid_to,
    r.event_title,
    r.method ? PAYMENT_METHOD_LABELS[r.method] : null,
    n(r.amount),
    EXPENSE_STATUS_LABELS[r.status],
    r.added_by,
    r.status === "approved" ? r.approved_by : null,
    r.note,
    r.has_photo ? "Yes" : "No",
  ]);
  return { filename, content: toCsv(header, data), rows: data.length };
}
