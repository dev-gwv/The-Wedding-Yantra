"use client";

import { assignableRoles, formatPhone, ROLE_INFO, type Role } from "@wedding-yantra/core";
import { useRemoveMember, useUpdateMember } from "@wedding-yantra/api-client/react";
import type { Member } from "@wedding-yantra/types";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

/** Change someone's role in the app, or take them off the team. */
export function ManageSheet({
  member,
  onClose,
  startRemoving = false,
  onRemoved,
}: {
  member: Member | null;
  onClose: () => void;
  startRemoving?: boolean;
  onRemoved?: () => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateMember(workspace.id);
  const remove = useRemoveMember(workspace.id);
  const toast = useToast();
  const [role, setRole] = useState<Role | null>(null);
  const [confirming, setConfirming] = useState<boolean | null>(null);

  if (!member) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const current = role ?? member.role;
  const roles = assignableRoles(workspace.role);
  const removing = confirming ?? startRemoving;

  function close() {
    setRole(null);
    setConfirming(null);
    onClose();
  }

  async function save() {
    try {
      await update.mutateAsync({ memberId: member!.id, role: current });
      toast("Role updated");
      close();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function removeMember() {
    try {
      await remove.mutateAsync(member!.id);
      toast(`${member!.name ?? "Member"} removed. Their details stay under Left.`);
      close();
      onRemoved?.();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Sheet open onClose={close} title={member.name ?? "Team member"} description={formatPhone(member.phone)}>
      {removing ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {member.name ?? "They"} will lose access to {workspace.name} straight away. Their past work and employee details stay.
          </p>
          <Button variant="destructive" size="lg" onClick={removeMember} loading={remove.isPending}>
            Remove from team
          </Button>
          <Button variant="ghost" size="lg" onClick={() => (startRemoving ? close() : setConfirming(false))}>
            Keep
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <SelectField label="Role in the app" value={current} onChange={(e) => setRole(e.target.value as Role)} hint={ROLE_INFO[current].description}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label}
              </option>
            ))}
          </SelectField>
          <Button size="lg" onClick={save} loading={update.isPending} disabled={current === member.role}>
            Save
          </Button>
          <Button variant="danger" size="lg" onClick={() => setConfirming(true)}>
            Remove from team
          </Button>
        </div>
      )}
    </Sheet>
  );
}
