import { randomBytes } from "node:crypto";
import { BUILTIN_OPTIONS, can, OPTION_LISTS, TRADE_EXPENSE_CATEGORIES, type OptionList, type Permission } from "@wedding-yantra/core";
import type { CustomOption } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

interface OptionRow {
  id: string;
  list: OptionList;
  key: string;
  label: string;
  position: number;
  archived_at: Date | null;
}

const isBuiltin = (list: OptionList, key: string) => BUILTIN_OPTIONS[list].some((o) => o.key === key);

const toOption = (r: OptionRow): CustomOption => ({
  id: r.id,
  list: r.list,
  key: r.key,
  label: r.label,
  position: r.position,
  archived: r.archived_at !== null,
  builtin: isBuiltin(r.list, r.key),
});

/** Who may add to a list from the form they're filling in; renaming and hiding stay with owners and managers. */
const ADD_RIGHT: Record<OptionList, Permission[]> = {
  payment_method: ["payments.record", "bills.manage"],
  expense_category: ["expenses.submit"],
};

/** A new business starts with the built-in options, plus the categories its trade usually needs. */
export async function installOptions(db: Queryable, workspaceId: string, businessTypeId: string): Promise<void> {
  for (const list of OPTION_LISTS) {
    const seeds = [...BUILTIN_OPTIONS[list]];
    if (list === "expense_category") {
      for (const label of TRADE_EXPENSE_CATEGORIES[businessTypeId] ?? []) seeds.push({ key: newKey(), label });
    }
    for (const [position, o] of seeds.entries()) {
      await db.query(
        `INSERT INTO custom_options (workspace_id, list, key, label, position) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
        [workspaceId, list, o.key, o.label, position],
      );
    }
  }
}

const newKey = () => `x_${randomBytes(6).toString("hex")}`;

/** Every option the business has, hidden ones included (records may still use them). */
export async function listOptions(db: Queryable, workspaceId: string, list?: OptionList): Promise<CustomOption[]> {
  const { rows } = await db.query<OptionRow>(
    `SELECT id, list, key, label, position, archived_at FROM custom_options
      WHERE workspace_id = $1 ${list ? "AND list = $2" : ""}
      ORDER BY list, position, created_at`,
    list ? [workspaceId, list] : [workspaceId],
  );
  return rows.map(toOption);
}

export async function addOption(db: Db, ctx: MemberContext, input: { list: OptionList; label: string }): Promise<CustomOption> {
  if (!can(ctx.role, "workspace.update") && !ADD_RIGHT[input.list].some((p) => can(ctx.role, p))) {
    throw forbidden("Your role can't add to this list");
  }
  return withTransaction(db, async (tx) => {
    // The same name in other capitals is the same option: bring it back instead of adding another.
    const same = await tx.query<OptionRow>(
      `SELECT id, list, key, label, position, archived_at FROM custom_options
        WHERE workspace_id = $1 AND list = $2 AND lower(label) = lower($3)
        ORDER BY archived_at NULLS FIRST LIMIT 1 FOR UPDATE`,
      [ctx.workspaceId, input.list, input.label],
    );
    if (same.rows[0]) {
      if (same.rows[0].archived_at === null) return toOption(same.rows[0]);
      const { rows } = await tx.query<OptionRow>(
        `UPDATE custom_options SET archived_at = NULL WHERE id = $1 RETURNING id, list, key, label, position, archived_at`,
        [same.rows[0].id],
      );
      return toOption(rows[0]!);
    }
    const { rows } = await tx.query<OptionRow>(
      `INSERT INTO custom_options (workspace_id, list, key, label, position)
       VALUES ($1, $2, $3, $4, (SELECT coalesce(max(position), -1) + 1 FROM custom_options WHERE workspace_id = $1 AND list = $2))
       RETURNING id, list, key, label, position, archived_at`,
      [ctx.workspaceId, input.list, newKey(), input.label],
    );
    return toOption(rows[0]!);
  });
}

const requireEdit = (ctx: MemberContext) => {
  if (!can(ctx.role, "workspace.update")) throw forbidden("Only the owner or a manager can change these lists");
};

/** Rename or hide/show. Records keep the key, so a rename shows everywhere at once. */
export async function updateOption(db: Db, ctx: MemberContext, id: string, input: { label?: string; archived?: boolean }): Promise<CustomOption> {
  requireEdit(ctx);
  const sets: string[] = [];
  const values: unknown[] = [id, ctx.workspaceId];
  if (input.label !== undefined) {
    values.push(input.label);
    sets.push(`label = $${values.length}`);
  }
  if (input.archived !== undefined) sets.push(input.archived ? "archived_at = coalesce(archived_at, now())" : "archived_at = NULL");
  if (!sets.length) {
    const current = (await listOptions(db, ctx.workspaceId)).find((o) => o.id === id);
    if (!current) throw notFound("This option");
    return current;
  }
  try {
    const { rows } = await db.query<OptionRow>(
      `UPDATE custom_options SET ${sets.join(", ")} WHERE id = $1 AND workspace_id = $2
       RETURNING id, list, key, label, position, archived_at`,
      values,
    );
    if (!rows[0]) throw notFound("This option");
    return toOption(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new AppError(409, "DUPLICATE_OPTION", "There's already one with this name", { label: "There's already one with this name" });
    }
    throw err;
  }
}

export async function reorderOptions(db: Db, ctx: MemberContext, input: { list: OptionList; ids: string[] }): Promise<CustomOption[]> {
  requireEdit(ctx);
  await withTransaction(db, async (tx) => {
    for (const [position, id] of input.ids.entries()) {
      await tx.query(`UPDATE custom_options SET position = $3 WHERE id = $1 AND workspace_id = $2 AND list = $4`, [id, ctx.workspaceId, position, input.list]);
    }
  });
  return listOptions(db, ctx.workspaceId, input.list);
}

/**
 * Checks a key before a record is saved with it: it must be one of the business's options
 * and not hidden. A record keeping the key it already had is always fine.
 */
export async function assertOption(db: Queryable, workspaceId: string, list: OptionList, key: string, field: string, current?: string | null): Promise<void> {
  if (current !== undefined && current === key) return;
  const { rowCount } = await db.query(
    `SELECT 1 FROM custom_options WHERE workspace_id = $1 AND list = $2 AND key = $3 AND archived_at IS NULL`,
    [workspaceId, list, key],
  );
  if (!rowCount) {
    const message = list === "payment_method" ? "Choose a payment mode from your list" : "Choose a category from your list";
    throw new AppError(400, "VALIDATION_ERROR", message, { [field]: message });
  }
}

/** SQL for an option's name: join custom_options with this, then coalesce(<alias>.label, <column>). */
export const optionJoin = (alias: string, list: OptionList, workspaceCol: string, keyCol: string) =>
  `LEFT JOIN custom_options ${alias} ON ${alias}.workspace_id = ${workspaceCol} AND ${alias}.list = '${list}' AND ${alias}.key = ${keyCol}`;
