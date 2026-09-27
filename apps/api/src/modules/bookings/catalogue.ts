import { can, tradeSeed } from "@wedding-yantra/core";
import type { CatalogueItem, ServiceUnit } from "@wedding-yantra/types";
import type { Db, Queryable } from "../../db.js";
import { forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { assertOption, optionJoin } from "../options/service.js";

interface Row {
  id: string;
  name: string;
  category: string | null;
  category_label: string | null;
  description: string | null;
  unit: ServiceUnit;
  price: string;
  tax_rate: string;
  sac: string | null;
  active: boolean;
}

const toItem = (r: Row): CatalogueItem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  categoryLabel: r.category_label ?? r.category,
  description: r.description,
  unit: r.unit,
  price: Number(r.price),
  taxRate: Number(r.tax_rate),
  sac: r.sac,
  active: r.active,
});

const COLUMNS = "ci.id, ci.name, ci.category, sc.label AS category_label, ci.description, ci.unit, ci.price, ci.tax_rate, ci.sac, ci.active";
const FROM = `catalogue_items ci ${optionJoin("sc", "service_category", "ci.workspace_id", "ci.category")}`;

/** Everyone who can work on leads or quotes can read the price list. */
export function canRead(ctx: MemberContext) {
  return can(ctx.role, "leads.work") || can(ctx.role, "quotes.view");
}

export async function listCatalogue(db: Db, ctx: MemberContext, includeArchived = false): Promise<CatalogueItem[]> {
  if (!canRead(ctx)) throw forbidden();
  const { rows } = await db.query<Row>(
    `SELECT ${COLUMNS} FROM ${FROM}
      WHERE ci.workspace_id = $1 ${includeArchived ? "" : "AND ci.active"}
      ORDER BY ci.active DESC, sc.position NULLS LAST, ci.position, ci.created_at`,
    [ctx.workspaceId],
  );
  return rows.map(toItem);
}

async function getItem(db: Queryable, workspaceId: string, id: string): Promise<CatalogueItem> {
  const { rows } = await db.query<Row>(`SELECT ${COLUMNS} FROM ${FROM} WHERE ci.id = $1 AND ci.workspace_id = $2`, [id, workspaceId]);
  if (!rows[0]) throw notFound("This service");
  return toItem(rows[0]);
}

export async function createCatalogueItem(
  db: Db,
  ctx: MemberContext,
  input: { name: string; category?: string | null; description?: string | null; unit: ServiceUnit; price: number; taxRate: number; sac?: string | null },
): Promise<CatalogueItem> {
  if (!can(ctx.role, "catalogue.manage")) throw forbidden("Only the owner or a manager can change the price list");
  if (input.category) await assertOption(db, ctx.workspaceId, "service_category", input.category, "category");
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO catalogue_items (workspace_id, name, category, description, unit, price, tax_rate, sac, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT coalesce(max(position), -1) + 1 FROM catalogue_items WHERE workspace_id = $1))
     RETURNING id`,
    [ctx.workspaceId, input.name, input.category ?? null, input.description ?? null, input.unit, input.price, input.taxRate, input.sac ?? null],
  );
  return getItem(db, ctx.workspaceId, rows[0]!.id);
}

export async function updateCatalogueItem(
  db: Db,
  ctx: MemberContext,
  id: string,
  input: Partial<{
    name: string;
    category: string | null;
    description: string | null;
    unit: ServiceUnit;
    price: number;
    taxRate: number;
    sac: string | null;
    active: boolean;
  }>,
): Promise<CatalogueItem> {
  if (!can(ctx.role, "catalogue.manage")) throw forbidden("Only the owner or a manager can change the price list");
  if (input.category) {
    const was = await db.query<{ category: string | null }>(`SELECT category FROM catalogue_items WHERE id = $1 AND workspace_id = $2`, [id, ctx.workspaceId]);
    await assertOption(db, ctx.workspaceId, "service_category", input.category, "category", was.rows[0]?.category);
  }
  const map: [keyof typeof input, string][] = [
    ["name", "name"],
    ["category", "category"],
    ["description", "description"],
    ["unit", "unit"],
    ["price", "price"],
    ["taxRate", "tax_rate"],
    ["sac", "sac"],
    ["active", "active"],
  ];
  const sets: string[] = [];
  const values: unknown[] = [id, ctx.workspaceId];
  for (const [key, column] of map) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (sets.length) {
    const { rowCount } = await db.query(`UPDATE catalogue_items SET ${sets.join(", ")} WHERE id = $1 AND workspace_id = $2`, values);
    if (!rowCount) throw notFound("This service");
  }
  return getItem(db, ctx.workspaceId, id);
}

/** A new business's price list, from its trade's starter pack, each in its trade's category. */
export async function installCatalogue(
  db: Queryable,
  workspaceId: string,
  services: { name: string; unit: string; price: number }[],
  businessTypeId?: string,
): Promise<void> {
  const trade = tradeSeed(businessTypeId);
  for (const [i, s] of services.entries()) {
    await db.query(
      `INSERT INTO catalogue_items (workspace_id, name, category, unit, price, position) VALUES ($1, $2, $3, $4, $5, $6)`,
      [workspaceId, s.name, trade?.serviceCategoryOf[s.name] ?? (trade ? null : "main"), s.unit, s.price, i],
    );
  }
}

export const DEFAULT_QUOTE_TERMS =
  "50% advance to confirm the booking. Balance before the event.\nPrices are valid until the date on this quote.\nTravel and stay outside the city are charged separately.";
