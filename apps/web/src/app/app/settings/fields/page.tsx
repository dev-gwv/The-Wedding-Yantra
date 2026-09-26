"use client";

import { useCustomFields, useSaveCustomFields } from "@wedding-yantra/api-client/react";
import {
  can,
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_KIND_LABELS,
  CUSTOM_FIELD_KINDS,
  customFieldSuggestions,
  type CustomFieldEntity,
  type CustomFieldKind,
} from "@wedding-yantra/core";
import { saveCustomFieldsInput, type CustomField } from "@wedding-yantra/types";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage, validate } from "@/lib/errors";

const SECTIONS: Record<CustomFieldEntity, { title: string; about: string; save: string }> = {
  lead: { title: "Enquiries", about: "Asked when someone enquires, like skin type or guest count.", save: "Save enquiry fields" },
  client: { title: "Clients", about: "Kept on the client, like allergies or a family contact.", save: "Save client fields" },
  event: { title: "Events", about: "Filled for each booking, like power needed or plates confirmed.", save: "Save event fields" },
};

interface Row {
  key: string;
  id?: string;
  label: string;
  kind: CustomFieldKind;
  options: string;
}

const toRows = (fields: CustomField[]): Row[] => fields.map((f) => ({ key: f.id, id: f.id, label: f.label, kind: f.kind, options: f.options.join(", ") }));

export default function CustomFieldsPage() {
  const { workspace } = useCurrentWorkspace();
  const fields = useCustomFields(workspace.id);
  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Your own fields" subtitle="Add the details your business always asks for. They show on the forms and pages, for the whole team." />
      {fields.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {fields.isError && <Notice tone="danger">{errorMessage(fields.error)}</Notice>}
      {fields.data && (
        <div className="space-y-6">
          {CUSTOM_FIELD_ENTITIES.map((entity) => {
            const mine = fields.data.filter((f) => f.entity === entity);
            return <Section key={`${entity}-${mine.map((f) => f.id + f.label + f.kind + f.options.join()).join()}`} entity={entity} fields={mine} />;
          })}
        </div>
      )}
    </>
  );
}

function Section({ entity, fields }: { entity: CustomFieldEntity; fields: CustomField[] }) {
  const { workspace } = useCurrentWorkspace();
  const save = useSaveCustomFields(workspace.id);
  const toast = useToast();
  const editable = can(workspace.role, "workspace.update");
  const [rows, setRows] = useState<Row[]>(() => toRows(fields));
  const [error, setError] = useState<string | null>(null);
  const section = SECTIONS[entity];
  const taken = new Set(rows.map((r) => r.label.trim().toLowerCase()));
  const suggestions = customFieldSuggestions(workspace.businessTypeId).filter((s) => s.entity === entity && !taken.has(s.label.toLowerCase()));
  const shape = (list: Row[]) => JSON.stringify(list.map((r) => [r.id, r.label, r.kind, r.options]));
  const changed = shape(rows) !== shape(toRows(fields));

  const patch = (key: string, p: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const move = (i: number, by: number) =>
    setRows((r) => {
      const next = [...r];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item!);
      return next;
    });
  const add = (row: Omit<Row, "key">) => setRows((r) => [...r, { key: `new-${Date.now()}-${r.length}`, ...row }]);

  async function submit() {
    const payload = {
      entity,
      fields: rows.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        label: r.label,
        kind: r.kind,
        ...(r.kind === "choice" ? { options: r.options.split(",").map((o) => o.trim()).filter(Boolean) } : {}),
      })),
    };
    const check = validate(saveCustomFieldsInput, payload);
    if (check.errors) return setError(Object.values(check.errors)[0] ?? "Check the fields");
    setError(null);
    try {
      await save.mutateAsync(payload);
      toast(`${section.title} fields saved`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">{section.title}</h2>
      <p className="mt-0.5 text-sm text-ink-muted">{section.about}</p>

      {rows.length > 0 ? (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {rows.map((row, i) => (
            <li key={row.key} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={row.label}
                  onChange={(e) => patch(row.key, { label: e.target.value })}
                  disabled={!editable}
                  maxLength={40}
                  aria-label={`${section.title} field ${i + 1} name`}
                  placeholder="Field name"
                  className="h-11 min-w-0 flex-1 basis-40 rounded-xl border border-line bg-surface px-3 text-[15px] font-semibold focus:border-sun-300 focus:shadow-glow focus:outline-none disabled:bg-cream"
                />
                <select
                  value={row.kind}
                  onChange={(e) => patch(row.key, { kind: e.target.value as CustomFieldKind })}
                  disabled={!editable}
                  aria-label={`${row.label || "Field"} type`}
                  className="h-11 rounded-xl border border-line bg-surface px-3 text-sm font-semibold focus:border-sun-300 focus:outline-none disabled:bg-cream"
                >
                  {CUSTOM_FIELD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {CUSTOM_FIELD_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                {editable && (
                  <div className="flex shrink-0">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-2 text-ink-muted hover:bg-cream disabled:opacity-30" aria-label="Move up">
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} className="rounded-lg p-2 text-ink-muted hover:bg-cream disabled:opacity-30" aria-label="Move down">
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                      className="rounded-lg p-2 text-ink-muted hover:bg-danger-soft hover:text-danger"
                      aria-label={`Remove ${row.label || "field"}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
              {row.kind === "choice" && (
                <input
                  value={row.options}
                  onChange={(e) => patch(row.key, { options: e.target.value })}
                  disabled={!editable}
                  aria-label={`${row.label || "Field"} choices`}
                  placeholder="Choices, with commas: Dry, Oily, Normal"
                  className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm focus:border-sun-300 focus:shadow-glow focus:outline-none disabled:bg-cream"
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl bg-cream p-4 text-sm text-ink-muted">No fields yet.</p>
      )}

      {editable && (
        <div className="mt-4 space-y-4">
          {suggestions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Suggested for your business</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => add({ label: s.label, kind: s.kind, options: (s.options ?? []).join(", ") })}
                    className="inline-flex h-9 items-center gap-1 rounded-full bg-cream px-3.5 text-sm font-bold text-ink hover:bg-sun-100"
                  >
                    <Plus className="size-3.5" strokeWidth={2.5} /> {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => add({ label: "", kind: "text", options: "" })} disabled={rows.length >= 20}>
              <Plus className="size-4" /> Add a field
            </Button>
            {changed && (
              <Button onClick={submit} loading={save.isPending}>
                {section.save}
              </Button>
            )}
          </div>
          {error && <Notice tone="danger">{error}</Notice>}
          {fields.length > rows.filter((r) => r.id).length && changed && (
            <p className="text-sm text-ink-muted">A removed field disappears from every form and page. What was filled in it is kept, but hidden.</p>
          )}
        </div>
      )}
      {!editable && fields.length === 0 && <p className="mt-3 text-sm text-ink-muted">Only the owner or a manager can add fields.</p>}
    </Card>
  );
}
