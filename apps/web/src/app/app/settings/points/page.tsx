"use client";

import { can } from "@wedding-yantra/core";
import { usePointRules, useSavePointRules } from "@wedding-yantra/api-client/react";
import type { PointSettings } from "@wedding-yantra/types";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

/** How points are earned in this business: the owner's to change. */
export default function PointSettingsPage() {
  const { workspace } = useCurrentWorkspace();
  const settings = usePointRules(workspace.id);
  return (
    <>
      <BackLink href="/app/scores" label="Scores" />
      <PageHeader title="Points" subtitle="What each finished task earns, whether penalties count, and the bands on the leaderboard." />
      {settings.isPending ? <Splash /> : settings.isError ? <Notice tone="danger">{errorMessage(settings.error)}</Notice> : <Form key={JSON.stringify(settings.data)} initial={settings.data} />}
    </>
  );
}

function Form({ initial }: { initial: PointSettings }) {
  const { workspace } = useCurrentWorkspace();
  const owner = can(workspace.role, "workspace.update");
  const save = useSavePointRules(workspace.id);
  const toast = useToast();
  const [rules, setRules] = useState(initial.rules.map((r) => ({ ...r, text: String(r.points) })));
  const [penaltiesOn, setPenaltiesOn] = useState(initial.penaltiesOn);
  const [bands, setBands] = useState(initial.bands.map((b) => ({ name: b.name, min: String(b.min) })));
  const [error, setError] = useState<string | null>(null);

  const setRule = (key: string, patch: Partial<(typeof rules)[number]>) => setRules((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit() {
    setError(null);
    const parsedRules = rules.map((r) => ({ key: r.key, points: Number(r.text), enabled: r.enabled }));
    const bad = parsedRules.find((r) => !Number.isInteger(r.points));
    if (bad) return setError("Use whole numbers for points");
    const parsedBands = bands.map((b) => ({ name: b.name.trim(), min: Number(b.min) }));
    if (parsedBands.some((b) => !b.name || !Number.isInteger(b.min) || b.min < 0)) return setError("Each band needs a name and starting points (0 or more)");
    save.mutate(
      { rules: parsedRules, penaltiesOn, bands: parsedBands },
      { onSuccess: () => toast("Saved. New points count from now on."), onError: (err) => setError(errorMessage(err)) },
    );
  }

  const section = (penalty: boolean) => (
    <Card className={cn("divide-y divide-line overflow-hidden", penalty && !penaltiesOn && "opacity-60")}>
      {rules
        .filter((r) => r.penalty === penalty)
        .map((r) => (
          <div key={r.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{r.label}</span>
              {Number(r.text) !== r.defaultPoints && <span className="block text-xs text-ink-muted">Usually {r.defaultPoints}</span>}
            </span>
            <input
              type="number"
              inputMode="numeric"
              value={r.text}
              disabled={!owner || !r.enabled}
              onChange={(e) => setRule(r.key, { text: e.target.value })}
              aria-label={`Points for ${r.label}`}
              className="h-10 w-20 rounded-xl border border-line bg-surface px-3 text-right font-bold tabular disabled:opacity-50"
            />
            <Switch label={r.label} checked={r.enabled} disabled={!owner} onChange={(v) => setRule(r.key, { enabled: v })} />
          </div>
        ))}
    </Card>
  );

  return (
    <div className="max-w-2xl space-y-6">
      {!owner && <Notice>Only the owner can change how points work. Here is how they are earned.</Notice>}
      <section>
        <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">Rewards</h2>
        {section(false)}
        <p className="mt-2 px-1 text-sm text-ink-muted">Only tasks someone else gave count, and each is paid once, so nobody earns by giving themselves work.</p>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">Penalties</h2>
        <Card className="mb-3 flex items-center gap-4 px-4 py-4 sm:px-5">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Take points away</span>
            <span className="block text-sm text-ink-muted">Off by default. Most teams do better with rewards alone; turn on once everyone knows the rules.</span>
          </span>
          <Switch label="Penalties" checked={penaltiesOn} disabled={!owner} onChange={setPenaltiesOn} />
        </Card>
        {section(true)}
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider text-ink-muted">Bands</h2>
        <Card className="divide-y divide-line overflow-hidden">
          {bands.map((b, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <input
                value={b.name}
                disabled={!owner}
                onChange={(e) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                aria-label="Band name"
                maxLength={30}
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 font-semibold disabled:opacity-60"
              />
              <span className="text-sm text-ink-muted">from</span>
              <input
                type="number"
                inputMode="numeric"
                value={b.min}
                disabled={!owner}
                onChange={(e) => setBands((bs) => bs.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))}
                aria-label={`Points to reach ${b.name}`}
                className="h-10 w-20 rounded-xl border border-line bg-surface px-3 text-right font-bold tabular disabled:opacity-60"
              />
              {owner && bands.length > 2 && (
                <button type="button" onClick={() => setBands((bs) => bs.filter((_, j) => j !== i))} aria-label={`Remove ${b.name}`} className="rounded-lg p-2 text-ink-muted hover:bg-cream hover:text-danger">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </Card>
        {owner && bands.length < 6 && (
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setBands((bs) => [...bs, { name: "", min: "" }])}>
            <Plus className="size-4" /> Add a band
          </Button>
        )}
        <p className="mt-2 px-1 text-sm text-ink-muted">Points earned in the month. One band has to start at 0.</p>
      </section>

      {error && <Notice tone="danger">{error}</Notice>}
      {owner && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={submit} loading={save.isPending}>
            Save
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setRules((rs) => rs.map((r) => ({ ...r, text: String(r.defaultPoints), enabled: true })));
              setPenaltiesOn(false);
              setBands([
                { name: "Excellent", min: "80" },
                { name: "Good", min: "50" },
                { name: "Needs attention", min: "20" },
                { name: "Just starting", min: "0" },
              ]);
            }}
          >
            <RotateCcw className="size-4" /> Back to the usual
          </Button>
        </div>
      )}
    </div>
  );
}
