"use client";

import { assignableRoles, can, firstName, formatDate, formatPhone, ROLE_INFO, whatsappLink, type Role } from "@wedding-yantra/core";
import { useInviteMember, useRevokeInvitation, useTeam } from "@wedding-yantra/api-client/react";
import { createInvitationInput, EMPLOYMENT_TYPE_LABELS, type Invitation } from "@wedding-yantra/types";
import { ChevronRight, Copy, Lock, MessageCircle, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { cn } from "@/lib/cn";
import { Button, buttonClass } from "@/components/ui/button";
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
  const [tab, setTab] = useState<"team" | "left">("team");

  if (!can(myRole, "members.view")) {
    return (
      <>
        <BackLink href="/app/more" label="More" />
        <PageHeader title="Employees" />
        <Card>
          <EmptyState icon={Lock} title="Only the owner and managers see the team" action={<Link href="/app/team/me" className={buttonClass({})}>See your details</Link>}>
            Your own work details, emergency contact and bank details are here.
          </EmptyState>
        </Card>
      </>
    );
  }

  const canInvite = can(myRole, "members.invite");
  const members = team.data?.members ?? [];
  const invitations = team.data?.invitations ?? [];
  const former = team.data?.former ?? [];
  const showing = former.length > 0 ? tab : "team";

  return (
    <>
      <BackLink href="/app/masters" label="Master data" />
      <PageHeader
        title="Employees"
        subtitle={team.data ? `${members.length} ${members.length === 1 ? "person" : "people"} in your team` : undefined}
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
          {former.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["team", `In the team (${members.length})`],
                  ["left", `Left (${former.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={showing === key}
                  onClick={() => setTab(key)}
                  className={cn("h-9 rounded-full px-4 text-sm font-bold", showing === key ? "bg-ink text-surface" : "border border-line bg-surface text-ink hover:bg-cream")}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {showing === "left" ? (
            <Card className="divide-y divide-line overflow-hidden">
              {former.map((f) => (
                <Link key={f.id} href={`/app/team/${f.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream">
                  <Avatar name={f.name} muted />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.name ?? "Former member"}</span>
                    <span className="block text-sm text-ink-muted tabular">
                      {[f.designationLabel, formatPhone(f.phone)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-xs text-ink-muted">Left {formatDate(f.leftAt.slice(0, 10))}</span>
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              ))}
            </Card>
          ) : (
            <Card className="divide-y divide-line overflow-hidden">
              {members.map((m) => (
                <Link key={m.id} href={`/app/team/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-cream">
                  <Avatar name={m.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name ?? "New member"}
                      {m.isYou && <span className="font-normal text-ink-muted"> (you)</span>}
                    </span>
                    <span className="block truncate text-sm text-ink-muted tabular">
                      {[m.designationLabel, m.employmentType && EMPLOYMENT_TYPE_LABELS[m.employmentType], formatPhone(m.phone)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Pill tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_INFO[m.role].label}</Pill>
                  <ChevronRight className="size-4 shrink-0 text-ink-subtle" />
                </Link>
              ))}
            </Card>
          )}

          {showing === "team" && members.length === 1 && canInvite && invitations.length === 0 && (
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

          {showing === "team" && invitations.length > 0 && (
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
      <Avatar name={invitation.name} muted />
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
          className={buttonClass({ size: "lg" })}
        >
          <MessageCircle className="size-5" /> Send on WhatsApp
        </a>
        <Button variant="secondary" size="lg" onClick={copy}>
          <Copy className="size-4" /> Copy link
        </Button>
        <p className="break-all rounded-xl bg-cream px-3 py-2 text-xs text-ink-muted">{url}</p>
      </div>
    </Sheet>
  );
}
