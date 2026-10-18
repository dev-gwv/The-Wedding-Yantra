import type { StarterPack } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import { AppError } from "../../lib/http.js";
import { installCatalogue } from "../bookings/catalogue.js";
import { installStarterPackages } from "../bookings/packages.js";
import { installOptions } from "../options/service.js";
import { installChecklist } from "../tasks/service.js";

/** The starter packs of these kinds of work, in the order given; an unknown or retired one is refused. */
export async function loadTrades(db: Queryable, ids: string[]): Promise<{ id: string; pack: StarterPack }[]> {
  const { rows } = await db.query<{ id: string; starter_pack: StarterPack }>(
    `SELECT id, starter_pack FROM business_types WHERE id = ANY($1::text[]) AND active`,
    [ids],
  );
  const found = new Map(rows.map((r) => [r.id, r.starter_pack]));
  if (!ids.length || ids.some((id) => !found.has(id)))
    throw new AppError(400, "VALIDATION_ERROR", "Pick what your business does", { businessTypeIds: "Pick what your business does" });
  return ids.map((id) => ({ id, pack: found.get(id)! }));
}

/**
 * A kind of work added to a business (at sign-up, or later): its services, example packages,
 * checklist steps and list options, after what the business already has. Nothing it already
 * has (by name) is added twice. Sales stages stay the business's own.
 */
export async function installTrade(db: Queryable, workspaceId: string, trade: { id: string; pack: StarterPack }): Promise<void> {
  await installOptions(db, workspaceId, trade.id);
  await installCatalogue(db, workspaceId, trade.pack.services, trade.id);
  await installStarterPackages(db, workspaceId, trade.id);
  await installChecklist(db, workspaceId, trade.pack);
}
