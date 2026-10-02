"use client";

import {
  AREA_INFO,
  AREAS,
  areaGives,
  areaNeeds,
  areasOf,
  can,
  cleanAreas,
  eventScope,
  firstName,
  leadScope,
  ROLE_GRANTS,
  ROLE_INFO,
  startingAreas,
  teamScope,
  type Area,
} from "@wedding-yantra/core";
import { useApplyDepartmentScreens, useDepartmentAccess, useSaveMemberAccess, useUpdateMember } from "@wedding-yantra/api-client/react";
import type { Employee } from "@wedding-yantra/types";
import { useState } from "react";
import { OptionSelect, useOptionList } from "@/components/app/option-picker";
import { taskSections } from "@/components/app/task-sections";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { onUsualAccess, screenNames } from "@/components/team/access-words";
import { Button } from "@/components/ui/button";
import { Card, Notice, Pill } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

/** Roles whose screens come from their department; the owner sees everything and freelancers stay as they are. */
const hasScreens = (e: Employee) => e.role !== "owner" && e.role !== "freelancer";

/**
 * Who sees what, in one place: their department (which screens), their role (how much they
 * can do there), extra screens for this one person, and a plain sentence that sums it up.
 * Only the owner changes the department and extra screens; the role follows the usual rules.
 */
export function AccessCard({ employee: e, onChangeRole }: { employee: Employee; onChangeRole?: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const owner = can(workspace, "members.hr");
  const departments = useOptionList("department");
  const access = useDepartmentAccess(owner ? workspace.id : null);
  const save = useSaveMemberAccess(workspace.id, e.id);
  const apply = useApplyDepartmentScreens(workspace.id);
  const update = useUpdateMember(workspace.id);
  const toast = useToast();
  const first = firstName(e.name) || "This person";
  const deptName = e.department ? (e.departmentLabel ?? departments.labelOf(e.department)) : null;
  // The department's own screens, before the role is applied: for "Staff in Manager".
  const deptScreens = access.data && e.department ? (access.data.find((d) => d.department === e.department)?.areas ?? startingAreas(e.department)) : [];
  const shouldManage =
    owner && e.role === "staff" && !!e.department && (deptScreens.includes("team") || deptScreens.includes("settings") || e.department === "manager" || e.department === "admin");

  async function setDepartment(key: string | null) {
    try {
      await save.mutateAsync({ department: key });
      if (!key) toast(`${first} has no department now, so they have their role's usual access`);
      else toast(hasScreens(e) ? `${first} now sees ${departments.labelOf(key)}'s screens` : `${first} is in ${departments.labelOf(key)} now`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function turnOn() {
    try {
      await apply.mutateAsync([e.id]);
      toast(`${first} now sees ${deptName}'s screens`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function makeManager() {
    try {
      await update.mutateAsync({ memberId: e.id, role: "manager" });
      toast(`${first} is a Manager now`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 font-display text-lg font-extrabold">Access</h2>
      <div className="space-y-5">
        {owner ? (
          <fieldset disabled={save.isPending} className="min-w-0">
            <OptionSelect list="department" label="Department" value={e.department} onChange={(key) => void setDepartment(key)} none="No department" />
            <p className="mt-1.5 text-sm text-ink-muted">
              {hasScreens(e) ? "Decides which screens they see." : "For grouping only. It doesn't change any screens."}
            </p>
          </fieldset>
        ) : (
          <div>
            <p className="text-xs font-semibold text-ink-muted">Department</p>
            <p className="font-semibold">{deptName ?? <span className="font-normal text-ink-subtle">No department</span>}</p>
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-muted">Role</p>
            <p className="font-semibold">{ROLE_INFO[e.role].label}</p>
            <p className="text-sm text-ink-muted">{ROLE_INFO[e.role].description}</p>
          </div>
          {onChangeRole && (
            <Button variant="secondary" size="sm" onClick={onChangeRole}>
              Change
            </Button>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-ink-muted">Screens {e.isYou ? "you see" : "they see"}</p>
          {e.role === "owner" ? (
            <p className="text-sm">The owner sees everything.</p>
          ) : e.role === "freelancer" ? (
            <p className="text-sm">
              Freelancers see only the events they&apos;re booked on, and their tasks.{!e.isYou && " Make them Staff to give them screens."}
            </p>
          ) : e.areas.length === 0 ? (
            <p className="text-sm text-ink-muted">No screens yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {e.areas.map((a) => (
                <li key={a}>
                  <Pill tone={e.extraAreas.includes(a) ? "brand" : "neutral"}>
                    {AREA_INFO[a].label}
                    {e.departmentAreas.includes(a) ? (
                      <span className="ml-1 font-normal text-ink-muted">· from {deptName}</span>
                    ) : e.extraAreas.includes(a) ? (
                      <span className="ml-1 font-normal">· extra</span>
                    ) : null}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
        </div>

        {owner && onUsualAccess(e) && (
          <Notice tone="warning">
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1">Still on their usual access.</span>
              <Button size="sm" onClick={() => void turnOn()} loading={apply.isPending}>
                Turn on {deptName}&apos;s screens
              </Button>
            </div>
          </Notice>
        )}

        {owner && hasScreens(e) && (
          <ExtraScreens key={`${e.role}|${e.department}|${e.departmentOn}|${e.extraAreas.join()}`} employee={e} who={firstName(e.name) || "this person"} deptName={deptName} />
        )}

        {e.role !== "owner" && (
          <div className="rounded-2xl bg-cream px-4 py-3 text-sm">
            <p>{summary(e, deptName)}</p>
            <p className="mt-1.5 text-ink-muted">
              <span className="font-semibold text-ink">{e.isYou ? "Your" : "Their"} menu:</span> {menuOf(e).join(", ")}
            </p>
          </div>
        )}

        {shouldManage && (
          <Notice>
            <div className="flex flex-wrap items-center gap-3">
              <span className="min-w-0 flex-1">
                {e.name ?? first} is Staff in {deptName}. Make them a Manager so they can give tasks and run every lead?
              </span>
              <Button size="sm" variant="secondary" onClick={() => void makeManager()} loading={update.isPending}>
                Make them a Manager
              </Button>
            </div>
          </Notice>
        )}
      </div>
    </Card>
  );
}

/**
 * The owner switches on a screen for this one person, on top of what their department (or,
 * with none, their role) gives. Screens their role can't use stay off.
 */
function ExtraScreens({ employee: e, who, deptName }: { employee: Employee; who: string; deptName: string | null }) {
  const { workspace } = useCurrentWorkspace();
  const save = useSaveMemberAccess(workspace.id, e.id);
  const toast = useToast();
  const [extras, setExtras] = useState<Area[]>(e.extraAreas);
  // On their role's usual access, the screens it gives are already theirs.
  const fromRole = e.accessSource === "role" ? areasOf([...ROLE_GRANTS[e.role]]) : [];
  const shown = AREAS.filter((a) => !e.departmentAreas.includes(a));

  async function toggle(area: Area, on: boolean) {
    const before = extras;
    const next = cleanAreas(on ? [...extras, area] : extras.filter((a) => a !== area));
    setExtras(next);
    try {
      await save.mutateAsync({ extraAreas: next });
      toast(`${AREA_INFO[area].label} ${on ? "switched on" : "switched off"} for ${who}`);
    } catch (err) {
      setExtras(before);
      toast(errorMessage(err), "error");
    }
  }

  if (shown.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-ink-muted">Extra screens</p>
      <p className="text-sm text-ink-muted">Switch on a screen for {who} only, on top of what {deptName ?? "their role"} gives.</p>
      <div className="mt-2 divide-y divide-line rounded-2xl border border-line">
        {shown.map((a) => {
          const usable = areaGives(e.role, a).length > 0;
          const given = fromRole.includes(a) && !extras.includes(a);
          return (
            <div key={a} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{AREA_INFO[a].label}</span>
                {!usable && <span className="block text-sm text-ink-muted">Needs the {ROLE_INFO[areaNeeds(a)].label} role</span>}
                {usable && given && <span className="block text-sm text-ink-muted">Comes with their role</span>}
              </span>
              <Switch
                label={`${AREA_INFO[a].label} for ${who}`}
                checked={given || extras.includes(a)}
                disabled={!usable || given || save.isPending}
                onChange={(on) => void toggle(a, on)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A plain sentence that sums up what someone (not the owner) can do, from their permissions. */
function summary(e: Employee, deptName: string | null): string {
  const you = e.isYou;
  const name = you ? "You" : firstName(e.name) || "This person";
  const sees = you ? "see" : "sees";
  const they = you ? "you" : "they";
  const their = you ? "your" : "their";
  if (e.role === "freelancer") return `${name} ${sees} only the events ${they}'re booked on, and ${their} tasks.`;

  const parts = [e.areas.length ? `${name} ${sees} ${screenNames(e.areas)}.` : `${name} ${sees} no screens yet.`];
  if (e.role === "accountant") {
    parts.push("Can look, but can't change anything. No tasks.");
    return parts.join(" ");
  }
  const leads = leadScope(e);
  parts.push(leads === "all" ? `Every lead, not only ${their} own.` : leads === "own" ? `Only the leads ${they} add or are given.` : "Can't see leads.");
  parts.push(
    can(e, "payments.record") || can(e, "bills.manage") ? "Can record payments and make invoices." : can(e, "finance.view") ? "Can see money, but not change it." : "Can't see money.",
  );
  const team = teamScope(e);
  parts.push(
    team === "all"
      ? "Can give tasks to everyone."
      : team === "department"
        ? `Can give tasks to the people in ${deptName ?? `${their} department`}.`
        : can(e, "tasks.work")
          ? "Can't give tasks."
          : "No tasks.",
  );
  return parts.join(" ");
}

/** Their side menu, worked out the way the app works it out for them. */
function menuOf(e: Employee): string[] {
  return [
    "Home",
    leadScope(e) !== "none" && "Leads",
    can(e, "quotes.view") && !can(e, "finance.view") && "Quotes",
    eventScope(e) !== "none" && "Events",
    can(e, "tasks.work") && (taskSections(e).length > 1 ? "Team Task Management" : "My tasks"),
    can(e, "finance.view") && "Payments and invoices",
    "Master data",
  ].filter((item): item is string => !!item);
}
