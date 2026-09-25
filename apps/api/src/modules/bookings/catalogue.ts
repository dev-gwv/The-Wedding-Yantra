import { can } from "@wedding-yantra/core";
import type { CatalogueItem, ServiceUnit } from "@wedding-yantra/types";
import type { Db, Queryable } from "../../db.js";
import { forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

interface Row {
  id: string;
  name: string;
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
  description: r.description,
  unit: r.unit,
  price: Number(r.price),
  taxRate: Number(r.tax_rate),
  sac: r.sac,
  active: r.active,
});

const COLUMNS = "id, name, description, unit, price, tax_rate, sac, active";

/** Everyone who can work on leads or quotes can read the price list. */
function canRead(ctx: MemberContext) {
  return can(ctx.role, "leads.work") || can(ctx.role, "quotes.view");
}

export async function listCatalogue(db: Db, ctx: MemberContext, includeArchived = false): Promise<CatalogueItem[]> {
  if (!canRead(ctx)) throw forbidden();
  const { rows } = await db.query<Row>(
    `SELECT ${COLUMNS} FROM catalogue_items
      WHERE workspace_id = $1 ${includeArchived ? "" : "AND active"}
      ORDER BY active DESC, position, created_at`,
    [ctx.workspaceId],
  );
  return rows.map(toItem);
}

export async function createCatalogueItem(
  db: Db,
  ctx: MemberContext,
  input: { name: string; description?: string | null; unit: ServiceUnit; price: number; taxRate: number; sac?: string | null },
): Promise<CatalogueItem> {
  if (!can(ctx.role, "catalogue.manage")) throw forbidden("Only the owner or a manager can change the price list");
  const { rows } = await db.query<Row>(
    `INSERT INTO catalogue_items (workspace_id, name, description, unit, price, tax_rate, sac, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT coalesce(max(position), -1) + 1 FROM catalogue_items WHERE workspace_id = $1))
     RETURNING ${COLUMNS}`,
    [ctx.workspaceId, input.name, input.description ?? null, input.unit, input.price, input.taxRate, input.sac ?? null],
  );
  return toItem(rows[0]!);
}

export async function updateCatalogueItem(
  db: Db,
  ctx: MemberContext,
  id: string,
  input: Partial<{
    name: string;
    description: string | null;
    unit: ServiceUnit;
    price: number;
    taxRate: number;
    sac: string | null;
    active: boolean;
  }>,
): Promise<CatalogueItem> {
  if (!can(ctx.role, "catalogue.manage")) throw forbidden("Only the owner or a manager can change the price list");
  const map: [keyof typeof input, string][] = [
    ["name", "name"],
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
  const { rows } = await db.query<Row>(
    sets.length
      ? `UPDATE catalogue_items SET ${sets.join(", ")} WHERE id = $1 AND workspace_id = $2 RETURNING ${COLUMNS}`
      : `SELECT ${COLUMNS} FROM catalogue_items WHERE id = $1 AND workspace_id = $2`,
    values,
  );
  if (!rows[0]) throw notFound("This service");
  return toItem(rows[0]);
}

/** A new business's price list, from its trade's starter pack. */
export async function installCatalogue(
  db: Queryable,
  workspaceId: string,
  services: { name: string; unit: string; price: number }[],
): Promise<void> {
  for (const [i, s] of services.entries()) {
    await db.query(
      `INSERT INTO catalogue_items (workspace_id, name, unit, price, position) VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, s.name, s.unit, s.price, i],
    );
  }
}

export const DEFAULT_QUOTE_TERMS =
  "50% advance to confirm the booking. Balance before the event.\nPrices are valid until the date on this quote.\nTravel and stay outside the city are charged separately.";
