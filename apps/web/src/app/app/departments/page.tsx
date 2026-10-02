"use client";

import { can } from "@wedding-yantra/core";
import { useAddOption, useOptions, useTeam, useUpdateOption } from "@wedding-yantra/api-client/react";
import type { CustomOption, Member } from "@wedding-yantra/types";
import { Building2, Check, Eye, EyeOff, Lock, Pencil, Plus, X } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

/**
 * How the team is organised: each department with the people in it. A department only
 * groups people; what someone can see and do in the app comes from their role.
 */
export default function DepartmentsPage() {
  const { workspace } = useCurrentWorkspace();
  const role = workspace.role;
  const sees = can(role, "members.view");
  const editable = can(role, "workspace.update");
  const options = useOptions(workspace.id);
  const team = useTeam(sees ? workspace.id : null);
  const add = useAddOption(workspace.id);
  const toast = useToast();
  const [name, setName] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  if (!sees) {
    return (
      <>
        <BackLink href="/app/masters" label="Master data" />
        <PageHeader title="Departments" />
        <Card>
          <EmptyState icon={Lock} title="Departments are for the owner and managers">
            Your own department is on your details page.
          </EmptyState>
        </Card>
      </>
    );
  }

  const all = (options.data ?? []).filter((o) => o.list === "department").sort((a, b) => a.position - b.position);
  const live = all.filter((o) => !o.archived);
  const hidden = all.filter((o) => o.archived);
  const members = team.data?.members ?? [];
  const inDept = (key: string) => members.filter((m) => m.department === key);
  const unplaced = members.filter((m) => !m.department || !all.some((o) => o.key === m.department));

  async function addIt(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await add.mutateAsync({ list: "department", label: name.trim() });
      toast(`${name.trim()} added`);
      setName("");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <BackLink href="/app/masters" label="Master data" />
      <PageHeader
        title="Departments"
        subtitle="How your team is organised. Put each person in a department from their employee details. A department doesn't change what anyone can see in the app; their role does."
      />

      {editable && (
        <Card className="mb-6 p-4 sm:p-5">
          <form onSubmit={addIt} className="flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="New department, e.g. Production"
              aria-label="New department"
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] focus:border-sun-300 focus:shadow-glow focus:outline-none"
            />
            <Button type="submit" loading={add.isPending} disabled={!name.trim()}>
              <Plus className="size-4" strokeWidth={2.5} /> Add department
            </Button>
          </form>
        </Card>
      )}

      {(options.isPending || team.isPending) && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {options.isError && <Notice tone="danger">{errorMessage(options.error)}</Notice>}

      {options.data && team.data && (
        <div className="grid gap-4 md:grid-cols-2">
          {live.map((d) => (
            <DepartmentCard key={d.id} option={d} people={inDept(d.key)} editable={editable} />
          ))}
          {unplaced.length > 0 && (
            <Card className="p-5">
              <h2 className="font-display text-lg font-extrabold text-ink-muted">No department yet</h2>
              <p className="mt-0.5 text-sm text-ink-muted">Open someone to choose their department.</p>
              <People people={unplaced} />
            </Card>
          )}
        </div>
      )}

      {hidden.length > 0 && (
        <div className="mt-8">
          <button type="button" onClick={() => setShowHidden((v) => !v)} className="text-sm font-bold text-brand-strong">
            {showHidden ? "Hide" : "Show"} hidden departments ({hidden.length})
          </button>
          {showHidden && (
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {hidden.map((d) => (
                <DepartmentCard key={d.id} option={d} people={inDept(d.key)} editable={editable} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function DepartmentCard({ option, people, editable }: { option: CustomOption; people: Member[]; editable: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateOption(workspace.id);
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState(option.label);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!label.trim() || label.trim() === option.label) return setRenaming(false);
    try {
      await update.mutateAsync({ id: option.id, label: label.trim() });
      setRenaming(false);
      toast("Renamed");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }
  const setHidden = (archived: boolean) =>
    update.mutate(
      { id: option.id, archived },
      {
        onSuccess: () => toast(archived ? `${option.label} hidden. People in it keep it.` : `${option.label} is back`),
        onError: (err) => toast(errorMessage(err), "error"),
      },
    );

  return (
    <Card className={option.archived ? "p-5 opacity-80" : "p-5"}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-strong">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form onSubmit={save} className="flex gap-2">
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={40}
                aria-label="Department name"
                className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] focus:border-sun-300 focus:outline-none"
              />
              <Button type="submit" size="sm" loading={update.isPending} aria-label="Save name">
                <Check className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Cancel"
                onClick={() => {
                  setLabel(option.label);
                  setRenaming(false);
                }}
              >
                <X className="size-4" />
              </Button>
            </form>
          ) : (
            <h2 className="font-display text-lg font-extrabold">
              {option.label}
              {option.archived && <span className="ml-2 text-sm font-semibold text-ink-muted">Hidden</span>}
            </h2>
          )}
          <p className="text-sm text-ink-muted">{people.length === 0 ? "No one yet" : `${people.length} ${people.length === 1 ? "person" : "people"}`}</p>
        </div>
        {editable && !renaming && (
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setRenaming(true)} className="rounded-lg p-2 text-ink-muted hover:bg-cream" aria-label={`Rename ${option.label}`} title="Rename">
              <Pencil className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setHidden(!option.archived)}
              className="rounded-lg p-2 text-ink-muted hover:bg-cream"
              aria-label={option.archived ? `Show ${option.label} again` : `Hide ${option.label}`}
              title={option.archived ? "Show again" : "Hide"}
            >
              {option.archived ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
          </div>
        )}
      </div>
      <People people={people} />
    </Card>
  );
}

function People({ people }: { people: Member[] }) {
  if (people.length === 0) return null;
  return (
    <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
      {people.map((m) => (
        <li key={m.id}>
          <Link href={`/app/team/${m.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-cream">
            <Avatar name={m.name} className="size-8 text-[11px]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{m.name ?? m.phone}</span>
              {m.designationLabel && <span className="block truncate text-xs text-ink-muted">{m.designationLabel}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
