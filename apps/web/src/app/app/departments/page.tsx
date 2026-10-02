"use client";

import { AREA_INFO, can, firstName, resolveAccess, ROLE_INFO, startingAreas, type Area } from "@wedding-yantra/core";
import {
  useAddOption,
  useApplyDepartmentScreens,
  useDepartmentAccess,
  useOptions,
  useSaveMemberAccess,
  useTeam,
  useUpdateMember,
  useUpdateOption,
} from "@wedding-yantra/api-client/react";
import type { CustomOption, Member } from "@wedding-yantra/types";
import { Building2, Check, Eye, EyeOff, Lock, Pencil, Plus, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { onUsualAccess, screenNames } from "@/components/team/access-words";
import { ScreensSheet, type DepartmentScreens } from "@/components/team/screens-sheet";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState, NextStepCard, Notice, PageHeader, Pill } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

/** Who the owner said "Not now" to, about moving them to Accountant. Kept on this device. */
const notNowKey = (workspaceId: string) => `wy.move-accountant-dismissed.${workspaceId}`;

function readNotNow(workspaceId: string): string[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(notNowKey(workspaceId)) ?? "[]");
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function saveNotNow(workspaceId: string, ids: string[]) {
  try {
    window.localStorage.setItem(notNowKey(workspaceId), JSON.stringify(ids));
  } catch {
    // Storage blocked: it's hidden until the page is opened again.
  }
}

/**
 * How the team is organised: each department with its screens and the people in it. A
 * department decides which screens its people see; their role decides how much they can do
 * there. Only the owner adds, renames and hides departments and chooses their screens.
 */
export default function DepartmentsPage() {
  const { workspace } = useCurrentWorkspace();
  const sees = can(workspace, "members.view");
  const owner = can(workspace, "members.hr");
  const options = useOptions(workspace.id);
  const team = useTeam(sees ? workspace.id : null);
  const access = useDepartmentAccess(sees ? workspace.id : null);
  const add = useAddOption(workspace.id);
  const toast = useToast();
  const [name, setName] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [notNow, setNotNow] = useState<string[]>(() => readNotNow(workspace.id));

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
  // A department the owner hasn't changed (or just added) is on its starting screens.
  const screensOf = (option: CustomOption): DepartmentScreens => {
    const saved = access.data?.find((d) => d.department === option.key);
    return { key: option.key, label: option.label, areas: saved?.areas ?? startingAreas(option.key), isDefault: saved?.isDefault ?? true };
  };
  const areasOf = (key: string): Area[] | null => access.data?.find((d) => d.department === key)?.areas ?? null;
  const chosen = all.find((o) => o.key === choosing);
  const waiting = owner ? members.filter(onUsualAccess) : [];
  const accountantDept = all.find((o) => o.key === "accountant" && !o.archived);
  const viewOnly = owner && accountantDept ? members.filter((m) => m.role === "accountant" && !notNow.includes(m.id)) : [];

  function dismiss(memberId: string) {
    const next = [...notNow.filter((id) => id !== memberId), memberId];
    setNotNow(next);
    saveNotNow(workspace.id, next);
  }

  async function addIt(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const option = await add.mutateAsync({ list: "department", label: name.trim() });
      toast(`${option.label} added. Choose its screens.`);
      setName("");
      setChoosing(option.key);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  const card = (d: CustomOption) => (
    <DepartmentCard key={d.id} option={d} people={inDept(d.key)} areas={screensOf(d).areas} editable={owner} onChoose={() => setChoosing(d.key)} />
  );

  return (
    <>
      <BackLink href="/app/masters" label="Master data" />
      <PageHeader title="Departments" subtitle="Each department decides which screens its people see. Their role decides how much they can do there." />

      {owner && (
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

      {(options.isPending || team.isPending || access.isPending) && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {options.isError && <Notice tone="danger">{errorMessage(options.error)}</Notice>}
      {access.isError && <Notice tone="danger">{errorMessage(access.error)}</Notice>}

      {options.data && team.data && access.data && (
        <>
          {waiting.length > 0 && <TurnOnCard people={waiting} areasOf={areasOf} />}
          {accountantDept &&
            viewOnly.map((m) => <MoveToAccountant key={m.id} member={m} department={accountantDept} onNotNow={() => dismiss(m.id)} />)}

          <div className="grid gap-4 md:grid-cols-2">
            {live.map(card)}
            {unplaced.length > 0 && (
              <Card className="p-5">
                <h2 className="font-display text-lg font-extrabold text-ink-muted">No department yet</h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  They keep their role&apos;s usual access.{owner && " Open someone to put them in a department."}
                </p>
                <People people={unplaced} />
              </Card>
            )}
          </div>

          {hidden.length > 0 && (
            <div className="mt-8">
              <button type="button" onClick={() => setShowHidden((v) => !v)} className="text-sm font-bold text-brand-strong">
                {showHidden ? "Hide" : "Show"} hidden departments ({hidden.length})
              </button>
              {showHidden && <div className="mt-3 grid gap-4 md:grid-cols-2">{hidden.map(card)}</div>}
            </div>
          )}
        </>
      )}

      <ScreensSheet department={owner && chosen ? screensOf(chosen) : null} onClose={() => setChoosing(null)} />
    </>
  );
}

/**
 * People put in a department before departments decided screens still have their role's
 * usual access. One button turns their department's screens on, showing first what changes.
 */
function TurnOnCard({ people, areasOf }: { people: Member[]; areasOf: (key: string) => Area[] | null }) {
  const { workspace } = useCurrentWorkspace();
  const apply = useApplyDepartmentScreens(workspace.id);
  const toast = useToast();

  async function turnOn() {
    try {
      const { applied } = await apply.mutateAsync(people.map((m) => m.id));
      toast(applied === 1 ? "Done. 1 person now sees their department's screens." : `Done. ${applied} people now see their department's screens.`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <NextStepCard className="mb-6 p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold">Turn on department screens</h2>
      <p className="mt-1 text-sm text-ink-muted">
        These people were put in a department before departments decided screens, so they still have their usual access.
      </p>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
        {people.map((m) => {
          const next = resolveAccess({ role: m.role, department: m.department, departmentOn: true, departmentAreas: areasOf(m.department!), extraAreas: m.extraAreas });
          const gains = next.areas.filter((a) => !m.areas.includes(a));
          const losses = m.areas.filter((a) => !next.areas.includes(a));
          return (
            <li key={m.id} className="flex items-start gap-3 px-3 py-3">
              <Avatar name={m.name} className="size-8 text-[11px]" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold">
                  {m.name ?? m.phone}
                  <span className="font-normal text-ink-muted">
                    {" "}
                    · {m.departmentLabel ?? m.department} · {ROLE_INFO[m.role].label}
                  </span>
                </span>
                {gains.length > 0 && (
                  <span className="block">
                    <span className="font-semibold text-success">Will now see:</span> {screenNames(gains)}
                  </span>
                )}
                {losses.length > 0 && (
                  <span className="block">
                    <span className="font-semibold text-danger">Will no longer see:</span> {screenNames(losses)}
                  </span>
                )}
                {gains.length === 0 && losses.length === 0 && <span className="block text-ink-muted">Their screens stay the same.</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <Button className="mt-4" onClick={() => void turnOn()} loading={apply.isPending}>
        Turn on department screens
      </Button>
    </NextStepCard>
  );
}

/**
 * View only used to be called Accountant. Someone who keeps the books likely wants to record
 * payments and make invoices, so the owner is offered to make them Staff in Accountant.
 */
function MoveToAccountant({ member, department, onNotNow }: { member: Member; department: CustomOption; onNotNow: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateMember(workspace.id);
  const save = useSaveMemberAccess(workspace.id, member.id);
  const toast = useToast();
  const name = member.name ?? "This person";

  async function move() {
    try {
      await update.mutateAsync({ memberId: member.id, role: "staff" });
      await save.mutateAsync({ department: department.key });
      toast(`${firstName(name)} is now Staff in ${department.label}`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Card className="mb-4 flex flex-wrap items-center gap-3 p-4 sm:p-5">
      <Avatar name={member.name} />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{name}</span> is {ROLE_INFO.accountant.label}. Make them Staff in the {department.label} department so they can record
        payments, make invoices and get tasks?
      </p>
      <div className="flex basis-full justify-end gap-1 sm:basis-auto">
        <Button variant="ghost" size="sm" onClick={onNotNow}>
          Not now
        </Button>
        <Button size="sm" onClick={() => void move()} loading={update.isPending || save.isPending}>
          Make them Staff
        </Button>
      </div>
    </Card>
  );
}

function DepartmentCard({
  option,
  people,
  areas,
  editable,
  onChoose,
}: {
  option: CustomOption;
  people: Member[];
  areas: Area[];
  editable: boolean;
  onChoose: () => void;
}) {
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
      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label={`Screens in ${option.label}`}>
        {areas.length > 0 ? areas.map((a) => <Pill key={a}>{AREA_INFO[a].label}</Pill>) : <span className="text-sm text-ink-muted">No screens yet</span>}
      </div>
      {editable && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onChoose}>
          <SlidersHorizontal className="size-4" /> Choose screens
        </Button>
      )}
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
