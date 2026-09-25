"use client";

import {
  assignableRoles,
  can,
  canManageMember,
  firstName,
  formatPhone,
  ROLE_INFO,
  whatsappLink,
  type Role,
} from "@wedding-yantra/core";
import {
  useInviteMember,
  useRemoveMember,
  useRevokeInvitation,
  useTeam,
  useUpdateMember,
} from "@wedding-yantra/api-client/react";
import { createInvitationInput, type Invitation, type Member } from "@wedding-yantra/types";
import { ChevronRight, Copy, Lock, MessageCircle, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextField } from "@/components/ui/field";
import { Avatar, Card, EmptyState, Notice, PageHeader, Pill } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { inviteUrl } from "@/lib/links";

type Share = { name: string; phone: string; role: Role; token: string };

export default function TeamPage() {
  const { workspace } = useCurrentWorkspace();
  const myRole = workspace.role;
  const team = useTeam(can(myRole, "members.view") ? workspace.id : null);
  const [inviting, setInviting] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [managing, setManaging] = useState<Member | null>(null);

  if (!can(myRole, "members.view")) {
    return (
      <>
        <PageHeader title="Team" />
        <Card>
          <EmptyState icon={Lock} title="Only the owner and managers see the team">
            Ask them if you need to know who is working on an event.
          </EmptyState>
        </Card>
      </>
    );
  }

  const canInvite = can(myRole, "members.invite");
  const members = team.data?.members ?? [];
  const invitations = team.data?.invitations ?? [];

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={team.data ? `${members.length} ${members.length === 1 ? "person" : "people"}` : undefined}
        action={
          canInvite && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus className="size-4" /> Invite
            </Button>
          )
        }
      />

      {team.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {team.isError && <Notice tone="danger">{errorMessage(team.error)}</Notice>}

      {team.data && (
        <div className="space-y-8">
          <Card className="divide-y divide-line overflow-hidden">
            {members.map((m) => {
              const manageable = !m.isYou && can(myRole, "members.manage") && canManageMember(myRole, m.role);
              const body = (
                <>
                  <Avatar name={m.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name ?? "New member"}
                      {m.isYou && <span className="font-normal text-ink-muted"> (you)</span>}
                    </span>
                    <span className="block text-sm text-ink-muted tabular">{formatPhone(m.phone)}</span>
                  </span>
                  <Pill tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_INFO[m.role].label}</Pill>
                  {manageable && <ChevronRight className="size-4 shrink-0 text-ink-subtle" />}
                </>
              );
              return manageable ? (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setManaging(m)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted"
                >
                  {body}
                </button>
              ) : (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  {body}
                </div>
              );
            })}
          </Card>

          {members.length === 1 && canInvite && invitations.length === 0 && (
            <Card>
              <EmptyState
                icon={Users}
                title="Add the people you work with"
                action={<Button onClick={() => setInviting(true)}>Invite someone</Button>}
              >
                Invite staff, freelancers or your accountant by phone. They join with one tap from WhatsApp.
              </EmptyState>
            </Card>
          )}

          {invitations.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-ink-muted">Waiting to join</h2>
              <Card className="divide-y divide-line overflow-hidden">
                {invitations.map((inv) => (
                  <PendingInvite key={inv.id} invitation={inv} onShare={setShare} />
                ))}
              </Card>
            </section>
          )}
        </div>
      )}

      <InviteSheet
        open={inviting}
        onClose={() => setInviting(false)}
        roles={assignableRoles(myRole)}
        onCreated={(s) => {
          setInviting(false);
          setShare(s);
        }}
      />
      <ShareSheet share={share} onClose={() => setShare(null)} />
      <ManageSheet member={managing} myRole={myRole} onClose={() => setManaging(null)} />
    </>
  );
}

function PendingInvite({ invitation, onShare }: { invitation: Invitation; onShare: (s: Share) => void }) {
  const { workspace } = useCurrentWorkspace();
  const invite = useInviteMember(workspace.id);
  const revoke = useRevokeInvitation(workspace.id);
  const toast = useToast();

  // The link is only shown once, so "send again" makes a fresh one.
  async function resend() {
    try {
      const input = { name: invitation.name, phone: invitation.phone, role: invitation.role };
      const created = await invite.mutateAsync(input);
      onShare({ ...input, token: created.token });
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function cancel() {
    try {
      await revoke.mutateAsync(invitation.id);
      toast("Invite cancelled");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={invitation.name} className="bg-surface-muted text-ink-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{invitation.name}</span>
        <span className="block text-sm text-ink-muted tabular">
          {formatPhone(invitation.phone)} · {ROLE_INFO[invitation.role].label}
        </span>
      </span>
      <div className="flex basis-full justify-end gap-1 sm:basis-auto">
        <Button variant="ghost" size="sm" onClick={cancel} loading={revoke.isPending}>
          Cancel
        </Button>
        <Button variant="secondary" size="sm" onClick={resend} loading={invite.isPending}>
          Send again
        </Button>
      </div>
    </div>
  );
}

function InviteSheet({
  open,
  onClose,
  roles,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  roles: Role[];
  onCreated: (share: Share) => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const invite = useInviteMember(workspace.id);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>(roles.includes("staff") ? "staff" : (roles[0] ?? "staff"));
  const [errors, setErrors] = useState<Record<string, string>>({});

  function close() {
    setErrors({});
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(createInvitationInput, { name, phone, role });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const created = await invite.mutateAsync({ name, phone, role });
      onCreated({ name, phone: created.invitation.phone, role, token: created.token });
      setName("");
      setPhone("");
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <Sheet open={open} onClose={close} title="Invite to your team" description="They'll get a link to join.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
        <PhoneField label="Mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        <SelectField
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          error={errors.role}
          hint={ROLE_INFO[role].description}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_INFO[r].label}
            </option>
          ))}
        </SelectField>
        {errors._ && <Notice tone="danger">{errors._}</Notice>}
        <Button type="submit" size="lg" loading={invite.isPending}>
          Create invite
        </Button>
      </form>
    </Sheet>
  );
}

function ShareSheet({ share, onClose }: { share: Share | null; onClose: () => void }) {
  const { me, workspace } = useCurrentWorkspace();
  const toast = useToast();
  if (!share) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const url = inviteUrl(share.token);
  const message =
    `Hi ${firstName(share.name)}, ${me.user.name ?? "I"} has added you to ${workspace.name} on Wedding Yantra ` +
    `as ${ROLE_INFO[share.role].label.toLowerCase()}. Tap to join: ${url}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Invite ready for ${firstName(share.name)}`}
      description="Send the link. It works once and expires in 7 days."
    >
      <div className="space-y-3">
        <a
          href={whatsappLink(message, share.phone)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setTimeout(onClose, 300)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand text-base font-medium text-on-brand shadow-sm hover:bg-brand-strong"
        >
          <MessageCircle className="size-5" /> Send on WhatsApp
        </a>
        <Button variant="secondary" size="lg" onClick={copy}>
          <Copy className="size-4" /> Copy link
        </Button>
        <p className="break-all rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">{url}</p>
      </div>
    </Sheet>
  );
}

function ManageSheet({ member, myRole, onClose }: { member: Member | null; myRole: Role; onClose: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateMember(workspace.id);
  const remove = useRemoveMember(workspace.id);
  const toast = useToast();
  const [role, setRole] = useState<Role | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!member) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const current = role ?? member.role;
  const roles = assignableRoles(myRole);

  function close() {
    setRole(null);
    setConfirming(false);
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
      toast(`${member!.name ?? "Member"} removed`);
      close();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Sheet open onClose={close} title={member.name ?? "Team member"} description={formatPhone(member.phone)}>
      {confirming ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {member.name ?? "They"} will lose access to {workspace.name} straight away. Their past work stays.
          </p>
          <Button variant="primary" size="lg" className="bg-danger hover:bg-danger" onClick={removeMember} loading={remove.isPending}>
            Remove from team
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <SelectField
            label="Role"
            value={current}
            onChange={(e) => setRole(e.target.value as Role)}
            hint={ROLE_INFO[current].description}
          >
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
