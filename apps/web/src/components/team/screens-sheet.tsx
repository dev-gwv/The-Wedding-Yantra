"use client";

import { AREA_INFO, AREAS, areaNeeds, cleanAreas, startingAreas, type Area } from "@wedding-yantra/core";
import { useSetDepartmentScreens } from "@wedding-yantra/api-client/react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { screenNames } from "@/components/team/access-words";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

export interface DepartmentScreens {
  key: string;
  label: string;
  areas: Area[];
  /** True while it uses its starting screens */
  isDefault: boolean;
}

/** The owner chooses which screens the people in a department see. */
export function ScreensSheet({ department, onClose }: { department: DepartmentScreens | null; onClose: () => void }) {
  return (
    <Sheet
      open={!!department}
      onClose={onClose}
      title={department ? `${department.label}: screens` : ""}
      description="The screens people in this department see. Their role decides how much they can do there."
    >
      {department && <ScreensForm department={department} onDone={onClose} />}
    </Sheet>
  );
}

function ScreensForm({ department: d, onDone }: { department: DepartmentScreens; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const save = useSetDepartmentScreens(workspace.id);
  const toast = useToast();
  const [picked, setPicked] = useState<Area[]>(d.areas);
  const starting = startingAreas(d.key);

  async function submit(areas: Area[] | null) {
    if (areas !== null && areas.join() === d.areas.join()) return onDone();
    try {
      await save.mutateAsync({ key: d.key, areas });
      toast(areas === null ? `${d.label} is back on its starting screens` : `${d.label}: screens saved`);
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <div className="space-y-5">
      <div className="divide-y divide-line rounded-2xl border border-line">
        {AREAS.map((a) => (
          <div key={a} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                {AREA_INFO[a].label}
                {areaNeeds(a) === "manager" && <Pill>For managers</Pill>}
              </span>
              <span className="mt-0.5 block text-sm text-ink-muted">{AREA_INFO[a].opens}</span>
            </span>
            <Switch
              label={AREA_INFO[a].label}
              checked={picked.includes(a)}
              onChange={(on) => setPicked((p) => cleanAreas(on ? [...p, a] : p.filter((x) => x !== a)))}
            />
          </div>
        ))}
      </div>
      <Button size="lg" onClick={() => void submit(picked)} loading={save.isPending && save.variables?.areas !== null}>
        Save
      </Button>
      {!d.isDefault && (
        <div className="text-center">
          <Button variant="ghost" onClick={() => void submit(null)} loading={save.isPending && save.variables?.areas === null}>
            Back to starting screens
          </Button>
          <p className="mt-1 text-xs text-ink-muted">{starting.length ? `${screenNames(starting)}.` : "No screens."}</p>
        </div>
      )}
    </div>
  );
}
