"use client";

import { can, canManageMember, firstName, formatDate, formatMoney, formatPhone, ROLE_INFO, whatsappLink } from "@wedding-yantra/core";
import { useEmployee } from "@wedding-yantra/api-client/react";
import { EMPLOYMENT_TYPE_LABELS, type Employee } from "@wedding-yantra/types";
import { ListChecks, Lock, MessageCircle, Pencil, Phone, UserMinus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { AccessCard } from "@/components/team/access-card";
import { EmployeeFormSheet } from "@/components/team/employee-form-sheet";
import { ManageSheet } from "@/components/team/manage-sheet";
import { Button, buttonClass } from "@/components/ui/button";
import { Avatar, Card, Notice, Pill } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

/** One person in the employee master: work details, access, emergency contact, pay and bank. */
export default function EmployeePage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const toast = useToast();
  const employee = useEmployee(workspace.id, id);
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState<null | "role" | "remove">(null);
  const back = can(workspace, "members.view") ? <BackLink href="/app/team" label="Employees" /> : <BackLink href="/app/more" label="More" />;

  if (employee.isPending) return <Splash />;
  if (employee.isError)
    return (
      <>
        {back}
        <Notice tone="danger">{errorMessage(employee.error)}</Notice>
      </>
    );
  const e = employee.data;
  const editable = can(workspace, "members.hr");
  const manageable = !e.isYou && !e.leftAt && can(workspace, "members.manage") && canManageMember(workspace.role, e.role);
  const name = e.name ?? "New member";

  return (
    <div className="space-y-6">
      {back}
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <Avatar name={e.name} className="size-14 text-lg" muted={!!e.leftAt} />
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(24px,4vw,32px)] font-extrabold leading-tight">
              {name}
              {e.isYou && <span className="text-lg font-bold text-ink-muted"> (you)</span>}
            </h1>
            <p className="text-ink-muted tabular">
              {[e.departmentLabel && `${e.departmentLabel} department`, e.designationLabel, e.employmentType && EMPLOYMENT_TYPE_LABELS[e.employmentType], formatPhone(e.phone)].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Pill tone={e.role === "owner" ? "brand" : "neutral"}>{ROLE_INFO[e.role].label}</Pill>
              {e.leftAt && <Pill>Left on {formatDate(e.leftAt.slice(0, 10))}</Pill>}
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {!e.isYou && !e.leftAt && (
            <>
              <a href={whatsappLink(`Hi ${firstName(name)}, `, e.phone)} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
                <MessageCircle className="size-4" /> WhatsApp
              </a>
              <a href={`tel:${e.phone}`} className={buttonClass({ variant: "secondary" })}>
                <Phone className="size-4" /> Call
              </a>
            </>
          )}
          {!e.leftAt && (e.isYou || can(workspace, "tasks.manage")) && (
            <Link href={`/app/tasks/people/${e.userId}`} className={buttonClass({ variant: "secondary" })}>
              <ListChecks className="size-4" /> Tasks and updates
            </Link>
          )}
          {editable && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit details
            </Button>
          )}
        </div>
      </Card>

      <WorkCard e={e} />
      {/* What someone can see is for the owner, managers of the team, and the person themselves. */}
      {!e.leftAt && (e.isYou || editable || can(workspace, "members.manage")) && (
        <AccessCard employee={e} onChangeRole={manageable ? () => setManaging("role") : undefined} />
      )}
      {e.emergency && <EmergencyCard e={e} />}
      {e.pay && <PayCard e={e} owner={editable} />}

      {!editable && e.isYou && <p className="text-sm text-ink-muted">Something wrong or missing? Ask the owner to change it.</p>}
      {editable && isEmpty(e) && (
        <Card className="p-5 text-center">
          <p className="mb-3 text-ink-muted">No details added for {firstName(name)} yet.</p>
          <Button onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Add details
          </Button>
        </Card>
      )}

      {manageable && (
        <div className="border-t border-line pt-6">
          <Button variant="ghost" size="sm" onClick={() => setManaging("remove")}>
            <UserMinus className="size-4" /> Remove from team
          </Button>
        </div>
      )}

      <EmployeeFormSheet
        employee={e}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          toast("Details saved");
        }}
      />
      <ManageSheet member={managing ? e : null} startRemoving={managing === "remove"} onClose={() => setManaging(null)} onRemoved={() => router.push("/app/team")} />
    </div>
  );
}

const isEmpty = (e: Employee) =>
  !e.designation &&
  !e.employmentType &&
  !e.joinedOn &&
  !e.emergency?.name &&
  !e.emergency?.phone &&
  !e.pay?.payAmount &&
  !e.pay?.upiId &&
  !e.pay?.bankAccount &&
  !e.pay?.pan;

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular">{children || <span className="font-normal text-ink-subtle">Not added</span>}</dd>
    </div>
  );
}

function WorkCard({ e }: { e: Employee }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-lg font-extrabold">Work</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] sm:grid-cols-3">
        <Detail label="Designation">{e.designationLabel}</Detail>
        <Detail label="Type">{e.employmentType && EMPLOYMENT_TYPE_LABELS[e.employmentType]}</Detail>
        <Detail label="Joining date">{e.joinedOn && formatDate(e.joinedOn)}</Detail>
        <Detail label="On the app since">{formatDate(e.joinedAt.slice(0, 10))}</Detail>
      </dl>
    </Card>
  );
}

function EmergencyCard({ e }: { e: Employee }) {
  const c = e.emergency!;
  return (
    <Card className="p-5">
      <h2 className="mb-3 font-display text-lg font-extrabold">Emergency contact</h2>
      {c.name || c.phone ? (
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={c.name} className="size-10 text-sm" muted />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{c.name ?? "No name"}</p>
            {c.phone && <p className="text-sm text-ink-muted tabular">{formatPhone(c.phone)}</p>}
          </div>
          {c.phone && (
            <a href={`tel:${c.phone}`} className={buttonClass({ variant: "secondary", size: "sm" })}>
              <Phone className="size-4" /> Call
            </a>
          )}
        </div>
      ) : (
        <p className="text-ink-subtle">Not added</p>
      )}
    </Card>
  );
}

function PayCard({ e, owner }: { e: Employee; owner: boolean }) {
  const p = e.pay!;
  const pay =
    p.payAmount != null ? `${formatMoney(p.payAmount)} ${p.payType === "daily" ? "a day" : "a month"}` : null;
  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">Pay and bank</h2>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
          <Lock className="size-3.5" /> {owner ? (e.isYou ? "Only you see this" : `Only you and ${firstName(e.name ?? "them")} see this`) : "Only you and the owner see this"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[15px] sm:grid-cols-3">
        <Detail label="Pay">{pay}</Detail>
        <Detail label="UPI ID">{p.upiId}</Detail>
        <Detail label="Bank account">{p.bankAccount}</Detail>
        <Detail label="IFSC">{p.ifsc}</Detail>
        <Detail label="PAN">{p.pan}</Detail>
      </dl>
    </Card>
  );
}
