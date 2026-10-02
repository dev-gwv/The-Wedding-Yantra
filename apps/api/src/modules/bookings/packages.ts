import { can, round2, tradeSeed } from "@wedding-yantra/core";
import type { PackageItem, ServicePackage, ServiceUnit } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";
import { canRead } from "./catalogue.js";

/**
 * Packages: services sold together at one price. Works for any trade: a makeup artist's
 * bridal package, a photographer's two-day wedding, a caterer's menu priced per plate.
 */

interface PackageRow {
  id: string;
  name: string;
  description: string | null;
  unit: ServiceUnit;
  price: string;
  tax_rate: string;
  sac: string | null;
  active: boolean;
}

interface ItemRow {
  id: string;
  package_id: string;
  catalogue_item_id: string | null;
  text: string | null;
  quantity: string | null;
  service_name: string | null;
  service_unit: ServiceUnit | null;
  service_price: string | null;
}

const requireManage = (ctx: MemberContext) => {
  if (!can(ctx, "catalogue.manage")) throw forbidden("Only the owner or a manager can change packages");
};

async function load(db: Queryable, workspaceId: string, where: string, params: unknown[]): Promise<ServicePackage[]> {
  const { rows } = await db.query<PackageRow>(
    `SELECT id, name, description, unit, price, tax_rate, sac, active FROM service_packages
      WHERE workspace_id = $1 ${where} ORDER BY active DESC, position, created_at`,
    [workspaceId, ...params],
  );
  if (!rows.length) return [];
  const items = await db.query<ItemRow>(
    `SELECT i.id, i.package_id, i.catalogue_item_id, i.text, i.quantity, ci.name AS service_name, ci.unit AS service_unit, ci.price AS service_price
       FROM service_package_items i
       LEFT JOIN catalogue_items ci ON ci.id = i.catalogue_item_id
      WHERE i.package_id = ANY($1::uuid[]) ORDER BY i.position`,
    [rows.map((r) => r.id)],
  );
  return rows.map((r) => {
    const mine: PackageItem[] = items.rows
      .filter((i) => i.package_id === r.id)
      .map((i) => {
        const quantity = i.catalogue_item_id ? Number(i.quantity ?? 1) : null;
        return {
          id: i.id,
          catalogueItemId: i.catalogue_item_id,
          name: i.service_name ?? i.text ?? "",
          quantity,
          unit: i.service_unit,
          value: i.service_price !== null && quantity !== null ? round2(Number(i.service_price) * quantity) : null,
        };
      });
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      unit: r.unit,
      price: Number(r.price),
      taxRate: Number(r.tax_rate),
      sac: r.sac,
      active: r.active,
      items: mine,
      worth: round2(mine.reduce((a, i) => a + (i.value ?? 0), 0)),
    };
  });
}

export async function listPackages(db: Queryable, ctx: MemberContext, includeHidden = false): Promise<ServicePackage[]> {
  if (!canRead(ctx)) throw forbidden();
  return load(db, ctx.workspaceId, includeHidden ? "" : "AND active", []);
}

async function getPackage(db: Queryable, workspaceId: string, id: string): Promise<ServicePackage> {
  const [p] = await load(db, workspaceId, "AND id = $2", [id]);
  if (!p) throw notFound("This package");
  return p;
}

interface ItemInput {
  catalogueItemId?: string | null;
  text?: string | null;
  quantity?: number | null;
}

async function writeItems(db: Queryable, workspaceId: string, packageId: string, items: ItemInput[]) {
  const ids = [...new Set(items.map((i) => i.catalogueItemId).filter((id): id is string => !!id))];
  if (ids.length) {
    const found = await db.query<{ id: string }>(`SELECT id FROM catalogue_items WHERE workspace_id = $1 AND id = ANY($2::uuid[])`, [workspaceId, ids]);
    if (found.rowCount !== ids.length) {
      throw new AppError(400, "VALIDATION_ERROR", "Choose services from your price list", { items: "Choose services from your price list" });
    }
  }
  await db.query(`DELETE FROM service_package_items WHERE package_id = $1`, [packageId]);
  for (const [i, item] of items.entries()) {
    await db.query(
      `INSERT INTO service_package_items (package_id, workspace_id, catalogue_item_id, text, quantity, position) VALUES ($1, $2, $3, $4, $5, $6)`,
      [packageId, workspaceId, item.catalogueItemId ?? null, item.catalogueItemId ? null : (item.text ?? null), item.catalogueItemId ? (item.quantity ?? 1) : null, i],
    );
  }
}

export interface PackageFields {
  name: string;
  description?: string | null;
  unit: ServiceUnit;
  price: number;
  taxRate: number;
  sac?: string | null;
  items: ItemInput[];
}

export async function createPackage(db: Db, ctx: MemberContext, input: PackageFields): Promise<ServicePackage> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO service_packages (workspace_id, name, description, unit, price, tax_rate, sac, created_by, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, (SELECT coalesce(max(position), -1) + 1 FROM service_packages WHERE workspace_id = $1))
       RETURNING id`,
      [ctx.workspaceId, input.name, input.description ?? null, input.unit, input.price, input.taxRate, input.sac ?? null, ctx.userId],
    );
    await writeItems(tx, ctx.workspaceId, rows[0]!.id, input.items);
    return getPackage(tx, ctx.workspaceId, rows[0]!.id);
  });
}

export async function updatePackage(db: Db, ctx: MemberContext, id: string, input: Partial<PackageFields> & { active?: boolean }): Promise<ServicePackage> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const exists = await tx.query(`SELECT 1 FROM service_packages WHERE id = $1 AND workspace_id = $2 FOR UPDATE`, [id, ctx.workspaceId]);
    if (!exists.rowCount) throw notFound("This package");
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
    const values: unknown[] = [id];
    for (const [key, column] of map) {
      if (input[key] === undefined) continue;
      values.push(input[key]);
      sets.push(`${column} = $${values.length}`);
    }
    if (sets.length) await tx.query(`UPDATE service_packages SET ${sets.join(", ")} WHERE id = $1`, values);
    if (input.items) await writeItems(tx, ctx.workspaceId, id, input.items);
    return getPackage(tx, ctx.workspaceId, id);
  });
}

/** A package that's gone for good. Quotes and invoices keep their copy of it. */
export async function deletePackage(db: Db, ctx: MemberContext, id: string): Promise<void> {
  requireManage(ctx);
  const { rowCount } = await db.query(`DELETE FROM service_packages WHERE id = $1 AND workspace_id = $2`, [id, ctx.workspaceId]);
  if (!rowCount) throw notFound("This package");
}

/**
 * The example packages for the business's trade, built from its price list: a service it
 * has by that name goes in as the service, else as a plain line. Skips a package it already has.
 */
export async function installStarterPackages(db: Queryable, workspaceId: string, businessTypeId: string | undefined): Promise<number> {
  const trade = tradeSeed(businessTypeId);
  if (!trade) return 0;
  const services = await db.query<{ id: string; name: string }>(
    `SELECT DISTINCT ON (lower(name)) id, name FROM catalogue_items WHERE workspace_id = $1 ORDER BY lower(name), active DESC, created_at`,
    [workspaceId],
  );
  const byName = new Map(services.rows.map((s) => [s.name.toLowerCase(), s.id]));
  let added = 0;
  for (const p of trade.packages) {
    const taken = await db.query(`SELECT 1 FROM service_packages WHERE workspace_id = $1 AND lower(name) = lower($2)`, [workspaceId, p.name]);
    if (taken.rowCount) continue;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO service_packages (workspace_id, name, description, unit, price, position)
       VALUES ($1, $2, $3, $4, $5, (SELECT coalesce(max(position), -1) + 1 FROM service_packages WHERE workspace_id = $1)) RETURNING id`,
      [workspaceId, p.name, p.description, p.unit, p.price],
    );
    await writeItems(
      db,
      workspaceId,
      rows[0]!.id,
      p.items.map((i) => {
        if ("text" in i) return { text: i.text };
        const id = byName.get(i.service.toLowerCase());
        return id ? { catalogueItemId: id, quantity: i.quantity } : { text: i.quantity > 1 ? `${i.service} × ${i.quantity}` : i.service };
      }),
    );
    added++;
  }
  return added;
}

/** For a business made before packages: add its trade's examples on request. */
export async function addStarterPackages(db: Db, ctx: MemberContext): Promise<ServicePackage[]> {
  requireManage(ctx);
  return withTransaction(db, async (tx) => {
    const ws = await tx.query<{ business_type_id: string }>(`SELECT business_type_id FROM workspaces WHERE id = $1`, [ctx.workspaceId]);
    await installStarterPackages(tx, ctx.workspaceId, ws.rows[0]?.business_type_id);
    return load(tx, ctx.workspaceId, "", []);
  });
}
