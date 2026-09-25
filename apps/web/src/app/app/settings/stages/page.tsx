"use client";

import { can } from "@wedding-yantra/core";
import { useLeads, useSaveStages } from "@wedding-yantra/api-client/react";
import { saveStagesInput, type PipelineStage, type StageKind } from "@wedding-yantra/types";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, Notice, PageHeader, Pill } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage, validate } from "@/lib/errors";

interface Row {
  key: string;
  id?: string;
  name: string;
  kind: StageKind;
  leadCount: number;
}

const toRows = (stages: PipelineStage[]): Row[] =>
  stages.map((s) => ({ key: s.id, id: s.id, name: s.name, kind: s.kind, leadCount: s.leadCount }));

export default function StagesPage() {
  const { workspace } = useCurrentWorkspace();
  const leads = useLeads(workspace.id);
  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Sales stages" subtitle="The steps every lead moves through, from first enquiry to booked." />
      {leads.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {leads.isError && <Notice tone="danger">{errorMessage(leads.error)}</Notice>}
      {leads.data && <StagesEditor key={leads.data.stages.map((s) => s.id + s.name).join()} stages={leads.data.stages} />}
    </>
  );
}

function StagesEditor({ stages }: { stages: PipelineStage[] }) {
  const { workspace } = useCurrentWorkspace();
  const save = useSaveStages(workspace.id);
  const toast = useToast();
  const editable = can(workspace.role, "workspace.update");
  const [rows, setRows] = useState<Row[]>(() => toRows(stages));
  const [error, setError] = useState<string | null>(null);

  const move = (i: number, by: number) =>
    setRows((r) => {
      const next = [...r];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item!);
      return next;
    });

  function addStage() {
    const wonAt = rows.findIndex((r) => r.kind !== "open");
    const at = wonAt === -1 ? rows.length : wonAt;
    setRows((r) => [...r.slice(0, at), { key: `new-${Date.now()}`, name: "", kind: "open", leadCount: 0 }, ...r.slice(at)]);
  }

  async function submit() {
    const payload = { stages: rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), name: r.name, kind: r.kind })) };
    const check = validate(saveStagesInput, payload);
    if (check.errors) return setError(Object.values(check.errors)[0] ?? "Check the stages");
    setError(null);
    try {
      await save.mutateAsync(payload);
      toast("Stages saved");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <Card className="divide-y divide-line overflow-hidden">
        {rows.map((row, i) => (
          <div key={row.key} className="flex items-center gap-2 px-4 py-3">
            <span className="w-6 shrink-0 text-center text-sm font-bold text-ink-subtle tabular">{i + 1}</span>
            <input
              value={row.name}
              onChange={(e) => setRows((r) => r.map((x) => (x.key === row.key ? { ...x, name: e.target.value } : x)))}
              disabled={!editable}
              aria-label={`Stage ${i + 1} name`}
              placeholder="Stage name"
              className="h-11 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-3 text-[15px] font-semibold hover:border-line focus:border-sun-300 focus:bg-surface focus:shadow-glow focus:outline-none"
            />
            {row.kind === "won" && <Pill tone="success">Booked</Pill>}
            {row.kind === "lost" && <Pill>Lost</Pill>}
            {row.leadCount > 0 && <span className="hidden text-sm text-ink-muted sm:inline">{row.leadCount} leads</span>}
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
                  disabled={row.kind !== "open" || row.leadCount > 0}
                  title={row.leadCount > 0 ? "Move its leads out first" : row.kind !== "open" ? "Booked and Lost always stay" : "Remove"}
                  className="rounded-lg p-2 text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="Remove stage"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </Card>
      {editable ? (
        <>
          <Button variant="secondary" onClick={addStage} disabled={rows.length >= 12}>
            <Plus className="size-4" /> Add a stage
          </Button>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button size="lg" onClick={submit} loading={save.isPending} className="sm:w-auto sm:px-8">
            Save stages
          </Button>
        </>
      ) : (
        <Notice>Only the owner or a manager can change stages.</Notice>
      )}
    </div>
  );
}
