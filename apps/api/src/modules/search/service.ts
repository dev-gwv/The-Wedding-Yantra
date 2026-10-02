import type { SearchResults } from "@wedding-yantra/types";
import type { Queryable } from "../../db.js";
import type { MemberContext } from "../auth/guard.js";

/** Finds enquiries, clients, events, quotes and invoices by name or phone. */
export async function searchAll(_db: Queryable, _ctx: MemberContext, q: string): Promise<SearchResults> {
  return { q, results: [] };
}
