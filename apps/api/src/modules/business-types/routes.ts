import type { FastifyInstance } from "fastify";
import type { BusinessType } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { ok } from "../../lib/http.js";

export function businessTypeRoutes(app: FastifyInstance, deps: { db: Db }) {
  app.get("/business-types", async () => {
    const { rows } = await deps.db.query<BusinessType>(
      `SELECT id, name, description, icon FROM business_types WHERE active ORDER BY sort_order, name`,
    );
    return ok(rows);
  });
}
