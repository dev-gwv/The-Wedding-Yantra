"use client";

import { can } from "@wedding-yantra/core";
import { useChecklist, useSaveChecklist } from "@wedding-yantra/api-client/react";
import { CHECKLIST_WHEN, CHECKLIST_WHEN_LABELS, saveChecklistInput, type ChecklistItem, type ChecklistWhen } from "@wedding-yantra/types";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage, validate } from "@/lib/errors";

interface Row {
  key: string;
  id?: string;
  title: string;
  when: ChecklistWhen;
  days: string;
}

const toRows = (items: ChecklistItem[]): Row[] => items.map((i) => ({ key: i.id, id: i.id, title: i.title, when: i.when, days: String(i.days) }));

export default function ChecklistPage() {
  const { workspace } = useCurrentWorkspace();
  const allowed = can(workspace.role, "tasks.work");
  const checklist = useChecklist(workspace.id, allowed);
  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title="Event checklist"
        subtitle="What gets done for every event. Add it to an event in one tap; each step gets its date from the event's functions."
      />
      {!allowed && <Notice>The checklist is for the people who work events.</Notice>}
      {checklist.isPending && allowed && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {checklist.isError && <Notice tone="danger">{errorMessage(checklist.error)}</Notice>}
      {checklist.data && <ChecklistEditor key={checklist.data.map((i) => i.id + i.title + i.days).join()} items={checklist.data} />}
    </>
  );
}

function ChecklistEditor({ items }: { items: ChecklistItem[] }) {
  const { workspace } = useCurrentWorkspace();
  const save = useSaveChecklist(workspace.id);
  const toast = useToast();
  const editable = can(workspace.role, "tasks.manage");
  const [rows, setRows] = useState<Row[]>(() => toRows(items));
  const [error, setError] = useState<string | null>(null);

  const change = (key: string, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const add = (when: ChecklistWhen) =>
    setRows((r) => {
      // New steps go at the end of their section.
      const lastOfKind = r.map((x) => x.when).lastIndexOf(when);
      const at = lastOfKind === -1 ? r.length : lastOfKind + 1;
      const row: Row = { key: `new-${Date.now()}`, title: "", when, days: when === "on_day" ? "0" : "1" };
      return [...r.slice(0, at), row, ...r.slice(at)];
    });

  async function submit() {
    const ordered = CHECKLIST_WHEN.flatMap((w) => rows.filter((r) => r.when === w));
    const payload = {
      items: ordered.map((r) => ({ ...(r.id ? { id: r.id } : {}), title: r.title, when: r.when, days: r.when === "on_day" ? 0 : r.days })),
    };
    const check = validate(saveChecklistInput, payload);
    if (check.errors) return setError(Object.values(check.errors)[0] ?? "Check the steps");
    setError(null);
    try {
      await save.mutateAsync(payload);
      toast("Checklist saved");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      {CHECKLIST_WHEN.map((when) => {
        const section = rows.filter((r) => r.when === when);
        return (
          <section key={when}>
            <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">{CHECKLIST_WHEN_LABELS[when]}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {section.length === 0 && <p className="px-5 py-4 text-sm text-ink-muted">No steps here.</p>}
              {section.map((row) => (
                // Phones: the step on one line, its days under it. Wider screens: one line.
                <div key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-x-2 px-3 py-2 sm:grid-cols-[1fr_auto_auto] sm:px-4">
                  <input
                    value={row.title}
                    onChange={(e) => change(row.key, { title: e.target.value })}
                    disabled={!editable}
                    aria-label="Step"
                    placeholder="What gets done"
                    maxLength={160}
                    className="col-start-1 row-start-1 h-11 min-w-0 rounded-xl border border-transparent bg-transparent px-3 text-[15px] font-semibold hover:border-line focus:border-sun-300 focus:bg-surface focus:shadow-glow focus:outline-none"
                  />
                  {when !== "on_day" && (
                    <label className="col-start-1 row-start-2 flex items-center gap-2 pb-1 pl-3 text-sm text-ink-muted sm:col-start-2 sm:row-start-1 sm:pb-0 sm:pl-0">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={365}
                        value={row.days}
                        onChange={(e) => change(row.key, { days: e.target.value })}
                        disabled={!editable}
                        aria-label={`Days ${when === "before" ? "before" : "after"} the event`}
                        className="h-10 w-16 rounded-xl border border-line bg-surface px-2 text-center font-semibold tabular text-ink focus:border-sun-300 focus:shadow-glow focus:outline-none"
                      />
                      {row.days === "0" ? "on the day" : `day${row.days === "1" ? "" : "s"} ${when === "before" ? "before" : "after"}`}
                    </label>
                  )}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => setRows((r) => r.filter((x) => x.key !== row.key))}
                      className="col-start-2 row-start-1 rounded-lg p-2 text-ink-muted hover:bg-danger-soft hover:text-danger sm:col-start-3"
                      aria-label="Remove step"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </Card>
            {editable && (
              <button
                type="button"
                onClick={() => add(when)}
                disabled={rows.length >= 60}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm font-bold text-brand-strong hover:bg-cream disabled:opacity-40"
              >
                <Plus className="size-4" /> Add a step
              </button>
            )}
          </section>
        );
      })}
      {editable ? (
        <>
          {error && <Notice tone="danger">{error}</Notice>}
          <p className="text-sm text-ink-muted">Changes apply to events you add the checklist to from now on. Tasks already on events stay as they are.</p>
          <Button size="lg" onClick={submit} loading={save.isPending} className="sm:w-auto sm:px-8">
            Save checklist
          </Button>
        </>
      ) : (
        <Notice>Only the owner or a manager can change the checklist.</Notice>
      )}
    </div>
  );
}
