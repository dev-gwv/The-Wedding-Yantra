"use client";

import { portalMessage, whatsappLink } from "@wedding-yantra/core";
import { useSharePortal, useStopPortal } from "@wedding-yantra/api-client/react";
import type { Client } from "@wedding-yantra/types";
import { Copy, ExternalLink, Globe, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, IconSquare } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";
import { portalUrl } from "@/lib/links";

/**
 * The client's own page: their event dates, quotes, bills and payments, always current.
 * For owners and managers, who share it on WhatsApp and can stop sharing it.
 */
export function PortalCard({ client, business }: { client: Client; business: string }) {
  const { workspace } = useCurrentWorkspace();
  const share = useSharePortal(workspace.id);
  const stop = useStopPortal(workspace.id);
  const toast = useToast();
  const [confirmStop, setConfirmStop] = useState(false);
  const url = client.portalToken && typeof window !== "undefined" ? portalUrl(client.portalToken) : null;

  async function turnOn() {
    try {
      await share.mutateAsync(client.id);
      toast("Their page is ready to share");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  }

  async function turnOff() {
    try {
      await stop.mutateAsync(client.id);
      setConfirmStop(false);
      toast("Stopped sharing. The old link no longer works.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <IconSquare icon={Globe} />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">Their page</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {url
              ? "Shared. They see their event dates, quotes, bills and what they've paid, always up to date."
              : "One link for everything with you: event dates, quotes, bills with Pay by UPI, and payments. No sign-in."}
          </p>
        </div>
      </div>
      {url ? (
        <>
          <p className="mt-4 truncate rounded-xl bg-cream px-3 py-2 text-sm font-semibold tabular text-ink-muted">{url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={whatsappLink(portalMessage({ clientName: client.name, business, link: url }), client.phone ?? undefined)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ size: "sm" })}
            >
              <MessageCircle className="size-4" /> Send on WhatsApp
            </a>
            <Button variant="secondary" size="sm" onClick={copy}>
              <Copy className="size-4" /> Copy link
            </Button>
            <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
              <ExternalLink className="size-4" /> Open
            </a>
            {!confirmStop && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmStop(true)}>
                Stop sharing
              </Button>
            )}
          </div>
          {confirmStop && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-cream p-3">
              <p className="min-w-0 flex-1 text-sm">The link stops working at once. You can share a new one later.</p>
              <Button variant="destructive" size="sm" loading={stop.isPending} onClick={turnOff}>
                Stop sharing
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmStop(false)}>
                Keep it
              </Button>
            </div>
          )}
        </>
      ) : (
        <Button variant="secondary" size="sm" className="mt-4" loading={share.isPending} onClick={turnOn}>
          Make their page
        </Button>
      )}
    </Card>
  );
}
