import { can, checkCustomValue, type CustomFieldEntity, type CustomFieldKind, type CustomValues } from "@wedding-yantra/core";
import type { CustomField } from "@wedding-yantra/types";
import { withTransaction, type Db, type Queryable } from "../../db.js";
import { AppError, forbidden } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

interface FieldRow {
  id: string;
  entity: CustomFieldEntity;
  label: string;
  kind: CustomFieldKind;
  options: string[];
}

const toField = (r: FieldRow): CustomField => ({ id: r.id, entity: r.entity, label: r.label, kind: r.kind, options: r.options });

/** Every member sees the fields; they're filled on enquiries, clients and events. */
export async function listFields(db: Queryable, workspaceId: string, entity?: CustomFieldEntity): Promise<CustomField[]> {
  const { rows } = await db.query<FieldRow>(
    `SELECT id, entity, label, kind, options FROM custom_fields
      WHERE workspace_id = $1 AND deleted_at IS NULL ${entity ? "AND entity = $2" : ""}
      ORDER BY array_position(ARRAY['lead', 'client', 'event', 'task'], entity::text), position, created_at`,
    entity ? [workspaceId, entity] : [workspaceId],
  );
  return rows.map(toField);
}

/** Replaces one entity's list in order. Fields left out are removed; their saved values stay hidden. */
export async function saveFields(
  db: Db,
  ctx: MemberContext,
  input: { entity: CustomFieldEntity; fields: { id?: string; label: string; kind: CustomFieldKind; options?: string[] }[] },
): Promise<CustomField[]> {
  if (!can(ctx.role, "workspace.update")) throw forbidden("Only the owner or a manager can change the fields");
  return withTransaction(db, async (tx) => {
    const current = await listFields(tx, ctx.workspaceId, input.entity);
    const known = new Set(current.map((f) => f.id));
    const keep = new Set<string>();
    for (const [position, f] of input.fields.entries()) {
      const options = f.kind === "choice" ? [...new Set(f.options ?? [])] : [];
      if (f.id && known.has(f.id)) {
        keep.add(f.id);
        await tx.query(`UPDATE custom_fields SET label = $2, kind = $3, options = $4, position = $5 WHERE id = $1`, [f.id, f.label, f.kind, options, position]);
      } else {
        await tx.query(
          `INSERT INTO custom_fields (workspace_id, entity, label, kind, options, position) VALUES ($1, $2, $3, $4, $5, $6)`,
          [ctx.workspaceId, input.entity, f.label, f.kind, options, position],
        );
      }
    }
    const gone = current.filter((f) => !keep.has(f.id)).map((f) => f.id);
    if (gone.length) await tx.query(`UPDATE custom_fields SET deleted_at = now() WHERE id = ANY($1::uuid[])`, [gone]);
    return listFields(tx, ctx.workspaceId, input.entity);
  });
}

const TABLES: Record<CustomFieldEntity, string> = { lead: "leads", client: "clients", event: "events", task: "tasks" };

/**
 * Checks the sent values against the business's fields and merges them into the row's
 * saved ones. Unknown fields are refused; a null clears a value.
 */
export async function writeCustom(
  db: Queryable,
  workspaceId: string,
  entity: CustomFieldEntity,
  id: string,
  input: Record<string, unknown> | undefined,
): Promise<void> {
  if (input === undefined) return;
  const fields = new Map((await listFields(db, workspaceId, entity)).map((f) => [f.id, f]));
  const errors: Record<string, string> = {};
  const clean: CustomValues = {};
  for (const [key, raw] of Object.entries(input)) {
    const field = fields.get(key);
    if (!field) {
      errors[`custom.${key}`] = "This field no longer exists";
      continue;
    }
    const checked = checkCustomValue(field, raw);
    if ("error" in checked) errors[`custom.${key}`] = checked.error;
    else clean[key] = checked.value;
  }
  if (Object.keys(errors).length) throw new AppError(400, "VALIDATION_ERROR", Object.values(errors)[0]!, errors);
  if (Object.keys(clean).length === 0) return;
  const cleared = Object.keys(clean).filter((k) => clean[k] === null);
  const set = Object.fromEntries(Object.entries(clean).filter(([, v]) => v !== null));
  await db.query(`UPDATE ${TABLES[entity]} SET custom = (custom - $3::text[]) || $2::jsonb WHERE id = $1`, [id, JSON.stringify(set), cleared]);
}
