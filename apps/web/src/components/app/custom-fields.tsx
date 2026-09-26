"use client";

import { useCustomFields } from "@wedding-yantra/api-client/react";
import { checkCustomValue, formatCustomValue, type CustomFieldEntity, type CustomValues } from "@wedding-yantra/core";
import type { CustomField } from "@wedding-yantra/types";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { SelectField, TextField } from "@/components/ui/field";
import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

/** The business's own fields for enquiries, clients or events, in their order. */
export function useEntityFields(entity: CustomFieldEntity): CustomField[] {
  const { workspace } = useCurrentWorkspace();
  const { data } = useCustomFields(workspace.id);
  return (data ?? []).filter((f) => f.entity === entity);
}

/** What a form holds while editing: every value as the text in its input. */
export type CustomDraft = Record<string, string>;

export const toDraft = (values: CustomValues | undefined): CustomDraft =>
  Object.fromEntries(Object.entries(values ?? {}).map(([k, v]) => [k, v === null ? "" : String(v)]));

/** The values to send, only for fields that still exist. Undefined when the business has none. */
export function customPayload(fields: CustomField[], draft: CustomDraft): Record<string, string> | undefined {
  if (!fields.length) return undefined;
  return Object.fromEntries(fields.map((f) => [f.id, draft[f.id] ?? ""]));
}

/** The same checks the server runs, so mistakes show before saving. Keys match the API's. */
export function checkDraft(fields: CustomField[], draft: CustomDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const checked = checkCustomValue(f, draft[f.id] ?? "");
    if ("error" in checked) errors[`custom.${f.id}`] = checked.error;
  }
  return errors;
}

/** One input per field, two to a row on wider screens. */
export function CustomFieldInputs({
  fields,
  draft,
  onChange,
  errors,
}: {
  fields: CustomField[];
  draft: CustomDraft;
  onChange: (draft: CustomDraft) => void;
  errors: Record<string, string>;
}) {
  if (!fields.length) return null;
  const set = (id: string) => (e: { target: { value: string } }) => onChange({ ...draft, [id]: e.target.value });
  return (
    <div className="grid gap-5 sm:grid-cols-2 sm:gap-3">
      {fields.map((f) => {
        const common = { label: f.label, value: draft[f.id] ?? "", onChange: set(f.id), error: errors[`custom.${f.id}`] };
        switch (f.kind) {
          case "choice":
            return (
              <SelectField key={f.id} {...common}>
                <option value="">Not set</option>
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </SelectField>
            );
          case "yes_no":
            return (
              <SelectField key={f.id} {...common}>
                <option value="">Not set</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </SelectField>
            );
          case "date":
            return <TextField key={f.id} type="date" {...common} />;
          case "number":
            return <TextField key={f.id} inputMode="decimal" {...common} />;
          default:
            return <TextField key={f.id} maxLength={500} {...common} />;
        }
      })}
    </div>
  );
}

/** Filled values as label and text, for detail pages. Nothing when none are filled. */
export function CustomFieldList({ entity, values, className }: { entity: CustomFieldEntity; values: CustomValues | undefined; className?: string }) {
  const fields = useEntityFields(entity);
  const rows = fields.map((f) => ({ f, text: formatCustomValue(f, values?.[f.id]) })).filter((r) => r.text !== null);
  if (!rows.length) return null;
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {rows.map(({ f, text }) => (
        <div key={f.id} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{f.label}</dt>
          <dd className="mt-0.5 break-words font-semibold">{text}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The same, in its own card with a heading. Nothing when none are filled. */
export function CustomFieldCard({ entity, values, title = "Details" }: { entity: CustomFieldEntity; values: CustomValues | undefined; title?: string }) {
  const fields = useEntityFields(entity);
  if (!fields.some((f) => formatCustomValue(f, values?.[f.id]) !== null)) return null;
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">{title}</h2>
      <CustomFieldList entity={entity} values={values} className="mt-4" />
    </Card>
  );
}
