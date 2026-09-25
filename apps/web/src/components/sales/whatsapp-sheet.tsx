"use client";

import { renderTemplate, whatsappLink } from "@wedding-yantra/core";
import { useAddLeadActivity, useTemplates } from "@wedding-yantra/api-client/react";
import type { Lead } from "@wedding-yantra/types";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";

/**
 * Pick a quick reply, see it filled in with the lead's details, and open WhatsApp with it
 * ready to send. The message is also noted on the lead's history.
 */
export function WhatsAppSheet({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: Lead }) {
  const { me, workspace } = useCurrentWorkspace();
  const templates = useTemplates(workspace.id);
  const log = useAddLeadActivity(workspace.id, lead.id);
  const [chosen, setChosen] = useState<string | null>(null);

  const values = { name: lead.name, business: workspace.name, eventDate: lead.eventDate, myName: me.user.name };
  const template = templates.data?.find((t) => t.id === chosen) ?? templates.data?.[0];
  const message = template ? renderTemplate(template.body, values) : "";

  return (
    <Sheet open={open} onClose={onClose} title={`Message ${lead.name.split(" ")[0]}`} description="Pick a reply. You can edit it in WhatsApp before sending.">
      {templates.isPending && (
        <div className="flex justify-center py-6 text-brand">
          <Spinner />
        </div>
      )}
      {templates.data && templates.data.length === 0 && (
        <Notice>
          No quick replies yet.{" "}
          <Link href="/app/settings/replies" className="font-bold text-brand-strong">
            Add one
          </Link>
        </Notice>
      )}
      {templates.data && template && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {templates.data.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setChosen(t.id)}
                aria-pressed={t.id === template.id}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-semibold transition",
                  t.id === template.id ? "bg-gradient-primary text-on-brand shadow-soft" : "bg-cream text-ink hover:bg-sun-100",
                )}
              >
                {t.title}
              </button>
            ))}
          </div>
          <p className="whitespace-pre-line rounded-2xl border border-line bg-cream p-4 text-[15px] leading-relaxed">{message}</p>
          <a
            href={whatsappLink(message, lead.phone ?? undefined)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ size: "lg" })}
            onClick={() => {
              log.mutate({ kind: "whatsapp", body: template.title });
              setTimeout(onClose, 300);
            }}
          >
            <MessageCircle className="size-5" /> Open WhatsApp
          </a>
          {!lead.phone && <p className="text-center text-sm text-ink-muted">No number saved, so WhatsApp will ask who to send it to.</p>}
        </div>
      )}
    </Sheet>
  );
}
