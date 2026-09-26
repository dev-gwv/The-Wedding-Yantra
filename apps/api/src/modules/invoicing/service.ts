import { can } from "@wedding-yantra/core";
import {
  bankAccountInput,
  type BankAccount,
  type BankAccountInput,
  type BankDetails,
  type SavedText,
  type SavedTextInput,
  type SavedTextKind,
  type UpdateBankAccountInput,
  type UpdateSavedTextInput,
} from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

/** Whoever makes invoices picks from these; the accountant sees them too. */
const requireView = (ctx: MemberContext) => {
  if (!can(ctx.role, "bills.manage") && !can(ctx.role, "finance.view")) throw forbidden("Your role doesn't include invoices");
};
const requireManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "bills.manage")) throw forbidden("Only the owner or a manager can change invoice settings");
};

// ---------------------------------------------------------------------------
// Saved notes and terms
// ---------------------------------------------------------------------------

interface TextRow {
  id: string;
  kind: SavedTextKind;
  title: string;
  body: string;
  is_default: boolean;
  position: number;
}

const toText = (r: TextRow): SavedText => ({ id: r.id, kind: r.kind, title: r.title, body: r.body, isDefault: r.is_default, position: r.position });

export async function listSavedTexts(db: Queryable, ctx: MemberContext): Promise<SavedText[]> {
  requireView(ctx);
  const { rows } = await db.query<TextRow>(
    `SELECT id, kind, title, body, is_default, position FROM saved_texts WHERE workspace_id = $1
      ORDER BY kind, is_default DESC, position, created_at`,
    [ctx.workspaceId],
  );
  return rows.map(toText);
}

/** The default note or terms, filled in on a new invoice. */
export async function defaultText(db: Queryable, workspaceId: string, kind: SavedTextKind): Promise<string | null> {
  const { rows } = await db.query<{ body: string }>(`SELECT body FROM saved_texts WHERE workspace_id = $1 AND kind = $2 AND is_default`, [
    workspaceId,
    kind,
  ]);
  return rows[0]?.body ?? null;
}

async function loadText(db: Queryable, ctx: MemberContext, id: string, lock = false): Promise<TextRow> {
  const { rows } = await db.query<TextRow>(
    `SELECT id, kind, title, body, is_default, position FROM saved_texts WHERE id = $1 AND workspace_id = $2${lock ? " FOR UPDATE" : ""}`,
    [id, ctx.workspaceId],
  );
  if (!rows[0]) throw notFound("This saved text");
  return rows[0];
}

const MAX_TEXTS = 30;

export async function addSavedText(db: Db, ctx: MemberContext, input: SavedTextInput): Promise<SavedText> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const count = await tx.query<{ n: string; next: number }>(
      `SELECT count(*) AS n, coalesce(max(position) + 1, 0)::int AS next FROM saved_texts WHERE workspace_id = $1 AND kind = $2`,
      [ctx.workspaceId, input.kind],
    );
    if (Number(count.rows[0]!.n) >= MAX_TEXTS) throw new AppError(400, "VALIDATION_ERROR", `Keep up to ${MAX_TEXTS} of these`);
    // The first one of its kind is the default, so new invoices get it without another step.
    const isDefault = input.isDefault ?? Number(count.rows[0]!.n) === 0;
    if (isDefault) await tx.query(`UPDATE saved_texts SET is_default = false WHERE workspace_id = $1 AND kind = $2 AND is_default`, [ctx.workspaceId, input.kind]);
    const { rows } = await tx.query<TextRow>(
      `INSERT INTO saved_texts (workspace_id, kind, title, body, is_default, position) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, kind, title, body, is_default, position`,
      [ctx.workspaceId, input.kind, input.title, input.body, isDefault, count.rows[0]!.next],
    );
    return toText(rows[0]!);
  });
}

export async function updateSavedText(db: Db, ctx: MemberContext, id: string, input: UpdateSavedTextInput): Promise<SavedText> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const current = await loadText(tx, ctx, id, true);
    if (input.isDefault === true && !current.is_default) {
      await tx.query(`UPDATE saved_texts SET is_default = false WHERE workspace_id = $1 AND kind = $2 AND is_default`, [ctx.workspaceId, current.kind]);
    }
    const { rows } = await tx.query<TextRow>(
      `UPDATE saved_texts SET title = $2, body = $3, is_default = $4 WHERE id = $1
       RETURNING id, kind, title, body, is_default, position`,
      [id, input.title ?? current.title, input.body ?? current.body, input.isDefault ?? current.is_default],
    );
    return toText(rows[0]!);
  });
}

/** Invoices keep their own copy of the text, so removing a saved one changes nothing already made. */
export async function deleteSavedText(db: Queryable, ctx: MemberContext, id: string): Promise<{ deleted: true }> {
  requireManage(ctx);
  await loadText(db, ctx, id);
  await db.query(`DELETE FROM saved_texts WHERE id = $1 AND workspace_id = $2`, [id, ctx.workspaceId]);
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

interface BankRow {
  id: string;
  label: string;
  account_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  bank_name: string | null;
  branch: string | null;
  upi_id: string | null;
  is_default: boolean;
  archived_at: Date | null;
}

const BANK_SELECT = `SELECT id, label, account_name, account_number, ifsc, bank_name, branch, upi_id, is_default, archived_at FROM bank_accounts`;

export const bankDetails = (r: BankRow): BankDetails => ({
  accountName: r.account_name,
  accountNumber: r.account_number,
  ifsc: r.ifsc,
  bankName: r.bank_name,
  branch: r.branch,
  upiId: r.upi_id,
});

const toAccount = (r: BankRow): BankAccount => ({
  id: r.id,
  label: r.label,
  ...bankDetails(r),
  isDefault: r.is_default,
  archived: r.archived_at !== null,
});

export async function listBankAccounts(db: Queryable, ctx: MemberContext): Promise<BankAccount[]> {
  requireView(ctx);
  const { rows } = await db.query<BankRow>(
    `${BANK_SELECT} WHERE workspace_id = $1 ORDER BY archived_at IS NOT NULL, is_default DESC, created_at`,
    [ctx.workspaceId],
  );
  return rows.map(toAccount);
}

async function loadAccount(db: Queryable, workspaceId: string, id: string, lock = false): Promise<BankRow> {
  const { rows } = await db.query<BankRow>(`${BANK_SELECT} WHERE id = $1 AND workspace_id = $2${lock ? " FOR UPDATE" : ""}`, [id, workspaceId]);
  if (!rows[0]) throw notFound("This bank account");
  return rows[0];
}

/**
 * The account to print on an invoice: the one asked for (null for none), or the default
 * when the invoice doesn't say. Hidden accounts can't be picked for a new invoice.
 */
export async function accountForBill(
  db: Queryable,
  workspaceId: string,
  asked: string | null | undefined,
): Promise<{ id: string; details: BankDetails } | null> {
  if (asked === null) return null;
  if (asked === undefined) {
    const { rows } = await db.query<BankRow>(`${BANK_SELECT} WHERE workspace_id = $1 AND is_default AND archived_at IS NULL`, [workspaceId]);
    return rows[0] ? { id: rows[0].id, details: bankDetails(rows[0]) } : null;
  }
  const { rows } = await db.query<BankRow>(`${BANK_SELECT} WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL`, [asked, workspaceId]);
  if (!rows[0]) throw new AppError(400, "VALIDATION_ERROR", "Choose one of your bank accounts", { bankAccountId: "Choose an account" });
  return { id: rows[0].id, details: bankDetails(rows[0]) };
}

export async function defaultAccountId(db: Queryable, workspaceId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM bank_accounts WHERE workspace_id = $1 AND is_default AND archived_at IS NULL`, [
    workspaceId,
  ]);
  return rows[0]?.id ?? null;
}

const MAX_ACCOUNTS = 10;

export async function addBankAccount(db: Db, ctx: MemberContext, input: BankAccountInput): Promise<BankAccount> {
  requireManage(ctx);
  const v = bankAccountInput.parse(input);
  return withTransaction(db, async (tx) => {
    const { rows: c } = await tx.query<{ n: string; live: string }>(
      `SELECT count(*) AS n, count(*) FILTER (WHERE archived_at IS NULL AND is_default) AS live FROM bank_accounts WHERE workspace_id = $1`,
      [ctx.workspaceId],
    );
    if (Number(c[0]!.n) >= MAX_ACCOUNTS) throw new AppError(400, "VALIDATION_ERROR", `Keep up to ${MAX_ACCOUNTS} accounts`);
    const isDefault = v.isDefault ?? Number(c[0]!.live) === 0;
    if (isDefault) await tx.query(`UPDATE bank_accounts SET is_default = false WHERE workspace_id = $1 AND is_default`, [ctx.workspaceId]);
    const { rows } = await tx.query<BankRow>(
      `INSERT INTO bank_accounts (workspace_id, label, account_name, account_number, ifsc, bank_name, branch, upi_id, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, label, account_name, account_number, ifsc, bank_name, branch, upi_id, is_default, archived_at`,
      [ctx.workspaceId, v.label, v.accountName ?? null, v.accountNumber ?? null, v.ifsc ?? null, v.bankName ?? null, v.branch ?? null, v.upiId ?? null, isDefault],
    );
    return toAccount(rows[0]!);
  });
}

/** Changes apply to new invoices; ones already made keep the details they were sent with. */
export async function updateBankAccount(db: Db, ctx: MemberContext, id: string, input: UpdateBankAccountInput): Promise<BankAccount> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const cur = await loadAccount(tx, ctx.workspaceId, id, true);
    const pick = <K extends keyof UpdateBankAccountInput>(k: K, fallback: string | null) => (input[k] !== undefined ? (input[k] as string | null) : fallback);
    const merged = bankAccountInput.safeParse({
      label: pick("label", cur.label),
      accountName: pick("accountName", cur.account_name),
      accountNumber: pick("accountNumber", cur.account_number),
      ifsc: pick("ifsc", cur.ifsc),
      bankName: pick("bankName", cur.bank_name),
      branch: pick("branch", cur.branch),
      upiId: pick("upiId", cur.upi_id),
    });
    if (!merged.success) {
      const issue = merged.error.issues[0]!;
      throw new AppError(400, "VALIDATION_ERROR", issue.message, { [String(issue.path[0] ?? "_")]: issue.message });
    }
    const v = merged.data;
    const archived = input.archived !== undefined ? input.archived : cur.archived_at !== null;
    // A hidden account can't stay the default; the default can't be hidden.
    let isDefault = archived ? false : (input.isDefault ?? cur.is_default);
    if (input.isDefault === true && archived) throw new AppError(400, "VALIDATION_ERROR", "Show this account again before making it the default");
    if (isDefault && !cur.is_default) await tx.query(`UPDATE bank_accounts SET is_default = false WHERE workspace_id = $1 AND is_default`, [ctx.workspaceId]);
    if (input.isDefault === false) isDefault = false;
    const { rows } = await tx.query<BankRow>(
      `UPDATE bank_accounts SET label = $2, account_name = $3, account_number = $4, ifsc = $5, bank_name = $6, branch = $7, upi_id = $8,
              is_default = $9, archived_at = CASE WHEN $10::boolean THEN coalesce(archived_at, now()) ELSE NULL END
        WHERE id = $1
        RETURNING id, label, account_name, account_number, ifsc, bank_name, branch, upi_id, is_default, archived_at`,
      [id, v.label, v.accountName ?? null, v.accountNumber ?? null, v.ifsc ?? null, v.bankName ?? null, v.branch ?? null, v.upiId ?? null, isDefault, archived],
    );
    return toAccount(rows[0]!);
  });
}
