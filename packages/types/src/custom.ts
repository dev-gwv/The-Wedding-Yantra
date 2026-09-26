import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_KINDS, type CustomFieldEntity, type CustomFieldKind } from "@wedding-yantra/core";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Custom fields: each business's own details on enquiries, clients and events
// ---------------------------------------------------------------------------

export interface CustomField {
  id: string;
  entity: CustomFieldEntity;
  label: string;
  kind: CustomFieldKind;
  options: string[];
}

/** Values sent with an enquiry, client or event, keyed by field id. null clears one. */
export const customValuesInput = z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional();

/** Saves one entity's list of fields in order; fields left out are removed. */
export const saveCustomFieldsInput = z.object({
  entity: z.enum(CUSTOM_FIELD_ENTITIES),
  fields: z
    .array(
      z
        .object({
          id: z.uuid().optional(),
          label: z.string().trim().min(1, "Name the field").max(40, "Keep it short"),
          kind: z.enum(CUSTOM_FIELD_KINDS),
          options: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
        })
        .refine((f) => f.kind !== "choice" || (f.options?.length ?? 0) >= 2, { message: "Give at least two choices", path: ["options"] }),
    )
    .max(20, "Twenty fields at most"),
});
export type SaveCustomFieldsInput = z.input<typeof saveCustomFieldsInput>;
