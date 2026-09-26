"use client";

import { useAddOption, useOptions, useReorderOptions, useUpdateOption } from "@wedding-yantra/api-client/react";
import { can, OPTION_LIST_INFO, OPTION_LISTS, type OptionList } from "@wedding-yantra/core";
import type { CustomOption } from "@wedding-yantra/types";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { OptionIcon } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

export default function ListsPage() {
  const { workspace } = useCurrentWorkspace();
  const options = useOptions(workspace.id);
  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Your lists" subtitle="Name things your way. Renaming changes old records too; hiding keeps them as they were." />
      {!can(workspace.role, "workspace.update") && <Notice>Only the owner or a manager can change these lists.</Notice>}
      {options.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {options.isError && <Notice tone="danger">{errorMessage(options.error)}</Notice>}
      {options.data && (
        <div className="space-y-6">
          {OPTION_LISTS.map((list) => (
            <ListCard
              key={list}
              list={list}
              options={options.data.filter((o) => o.list === list).sort((a, b) => a.position - b.position)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ListCard({ list, options }: { list: OptionList; options: CustomOption[] }) {
  const { workspace } = useCurrentWorkspace();
  const editable = can(workspace.role, "workspace.update");
  const add = useAddOption(workspace.id);
  const update = useUpdateOption(workspace.id);
  const reorder = useReorderOptions(workspace.id);
  const toast = useToast();
  const [name, setName] = useState("");
  const info = OPTION_LIST_INFO[list];
  const live = options.filter((o) => !o.archived);
  const hidden = options.filter((o) => o.archived);

  async function addIt(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await add.mutateAsync({ list, label: name.trim() });
      setName("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const move = (i: number, by: number) => {
    const ids = live.map((o) => o.id);
    const [id] = ids.splice(i, 1);
    ids.splice(i + by, 0, id!);
    reorder.mutate({ list, ids: [...ids, ...hidden.map((o) => o.id)] }, { onError: (err) => toast(errorMessage(err), "error") });
  };

  const setHidden = (o: CustomOption, archived: boolean) =>
    update.mutate({ id: o.id, archived }, { onError: (err) => toast(errorMessage(err), "error") });

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">{info.title}</h2>
      <p className="mt-0.5 text-sm text-ink-muted">{info.about}</p>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
        {live.map((o, i) => (
          <OptionRow
            key={o.id}
            option={o}
            editable={editable}
            onRename={(label) => update.mutateAsync({ id: o.id, label })}
            actions={
              editable && (
                <>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded-lg p-2 text-ink-muted hover:bg-cream disabled:opacity-30" aria-label={`Move ${o.label} up`}>
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === live.length - 1}
                    className="rounded-lg p-2 text-ink-muted hover:bg-cream disabled:opacity-30"
                    aria-label={`Move ${o.label} down`}
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" onClick={() => setHidden(o, true)} className="rounded-lg p-2 text-ink-muted hover:bg-cream" aria-label={`Hide ${o.label}`} title="Hide">
                    <EyeOff className="size-4" />
                  </button>
                </>
              )
            }
          />
        ))}
      </ul>
      {editable && (
        <form onSubmit={addIt} className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder={`New ${info.one}`}
            aria-label={`New ${info.one}`}
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] focus:border-sun-300 focus:shadow-glow focus:outline-none"
          />
          <Button type="submit" variant="secondary" loading={add.isPending} disabled={!name.trim()}>
            <Plus className="size-4" strokeWidth={2.5} /> Add
          </Button>
        </form>
      )}
      {hidden.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Hidden</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {hidden.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => setHidden(o, false)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-cream px-3.5 text-sm font-semibold text-ink-muted hover:bg-sun-100 hover:text-ink disabled:hover:bg-cream"
                  title="Show again"
                >
                  <Eye className="size-3.5" /> {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Tap the name to rename; Enter or leaving the field saves. */
function OptionRow({
  option,
  editable,
  onRename,
  actions,
}: {
  option: CustomOption;
  editable: boolean;
  onRename: (label: string) => Promise<unknown>;
  actions: React.ReactNode;
}) {
  const toast = useToast();
  const [label, setLabel] = useState(option.label);
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = label.trim();
    if (!next || next === option.label) return setLabel(option.label);
    setSaving(true);
    try {
      await onRename(next);
      toast(`Renamed to ${next}`);
    } catch (err) {
      toast(errorMessage(err), "error");
      setLabel(option.label);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-cream text-brand-strong">
        <OptionIcon optionKey={option.key} className="size-4" />
      </span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") setLabel(option.label);
        }}
        disabled={!editable || saving}
        maxLength={40}
        aria-label={`Name of ${option.label}`}
        className={cn(
          "h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-[15px] font-semibold focus:border-sun-300 focus:bg-surface focus:outline-none",
          editable && "hover:border-line",
        )}
      />
      <div className="flex shrink-0">{actions}</div>
    </li>
  );
}
