"use client";

import { timeAgo } from "@wedding-yantra/core";
import { usePhoneMatch } from "@wedding-yantra/api-client/react";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";

/**
 * A soft warning under a phone field once the number is complete: this person is already an
 * enquiry or a client. It never stops saving. "Open" shows only for records the viewer can open.
 */
export function PhoneMatchNote({ phone }: { phone: string }) {
  const { workspace } = useCurrentWorkspace();
  const match = usePhoneMatch(workspace.id, phone.replace(/\D/g, ""));
  if (phone.replace(/\D/g, "").length < 10 || !match.data) return null;
  const leads = match.data.leads.slice(0, 3);
  const clients = match.data.clients.slice(0, 3);
  if (leads.length === 0 && clients.length === 0) return null;

  return (
    <div role="status" className="space-y-2 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-ink">
      {leads.map((l, i) => (
        <Row
          key={`l${l.id ?? i}`}
          label="Already an enquiry"
          text={[l.name, l.stageName, l.assignedToName, timeAgo(l.createdAt)].filter(Boolean).join(" · ")}
          href={l.id ? `/app/leads/${l.id}` : null}
        />
      ))}
      {clients.map((c, i) => (
        <Row key={`c${c.id ?? i}`} label="Already a client" text={c.name} href={c.id ? `/app/clients/${c.id}` : null} />
      ))}
    </div>
  );
}

function Row({ label, text, href }: { label: string; text: string; href: string | null }) {
  return (
    <div className="flex items-start gap-2.5">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <p className="min-w-0 flex-1">
        <span className="font-bold text-warning">{label}:</span> {text}
      </p>
      {href && (
        <Link href={href} className="-my-1.5 shrink-0 rounded-lg px-2 py-1.5 font-bold text-brand-strong hover:bg-surface hover:text-brand-deep">
          Open
        </Link>
      )}
    </div>
  );
}
