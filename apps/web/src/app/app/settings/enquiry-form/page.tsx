"use client";

import { can, whatsappLink } from "@wedding-yantra/core";
import { useLeadForm, useSetLeadFormEnabled } from "@wedding-yantra/api-client/react";
import { ChevronRight, Copy, ExternalLink, Handshake, MessageCircle } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { QrDownloadButtons } from "@/components/ui/qr-download";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

export default function EnquiryFormPage() {
  const { workspace } = useCurrentWorkspace();
  const form = useLeadForm(workspace.id);
  const toggle = useSetLeadFormEnabled(workspace.id);
  const toast = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const editable = can(workspace, "leads.view_all");
  const url = form.data ? `${typeof window === "undefined" ? "" : window.location.origin}/f/${form.data.slug}` : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#241803", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  }

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Enquiry form" subtitle="A link anyone can fill in. Every enquiry becomes a lead that's due today." />
      {form.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {form.isError && <Notice tone="danger">{errorMessage(form.error)}</Notice>}
      {form.data && (
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <p className="text-sm font-semibold text-ink-muted">Your link</p>
            <p className="mt-1 break-all font-bold">{url}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={whatsappLink(`Tell us about your event and we'll get back to you: ${url}`)}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass()}
              >
                <MessageCircle className="size-4" /> Share on WhatsApp
              </a>
              <Button variant="secondary" onClick={copy}>
                <Copy className="size-4" /> Copy link
              </Button>
              <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
                <ExternalLink className="size-4" /> Open
              </a>
            </div>
            <p className="mt-4 text-sm text-ink-muted">Put it in your Instagram bio, WhatsApp Business profile and Google listing.</p>
          </Card>

          <Card className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
            <div
              className="size-44 shrink-0 rounded-2xl border border-line bg-surface p-2 [&_svg]:size-full"
              aria-label="QR code for your enquiry form"
              role="img"
              dangerouslySetInnerHTML={qr ? { __html: qr } : undefined}
            />
            <div>
              <h2 className="font-display text-lg font-extrabold">QR code</h2>
              <p className="mt-1 text-[15px] text-ink-muted">
                Print it for your studio, stall or wedding expo. People scan it and fill in their details.
              </p>
              <div className="mt-4">
                <QrDownloadButtons text={url} filename={`${workspace.name} enquiry QR`} title={workspace.name} subtitle="Scan to send us your enquiry" />
              </div>
              <p className="mt-2 text-xs text-ink-muted">A sharp image for printing up to A4, with your business name under it. SVG is for designers and large prints.</p>
            </div>
          </Card>

          {can(workspace, "leads.view_all") && (
            <Link href="/app/partners" className="flex items-center gap-4 rounded-3xl border border-sun-300/60 bg-gradient-to-br from-cream to-surface p-5 shadow-soft hover:border-sun-300">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-on-brand">
                <Handshake className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Partner QR codes</span>
                <span className="block text-sm text-ink-muted">A separate QR for each boutique, salon or venue you work with. See which enquiries each one sends.</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-subtle" />
            </Link>
          )}

          <Card className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="font-bold">{form.data.enabled ? "Accepting enquiries" : "Form is switched off"}</p>
              <p className="text-sm text-ink-muted">
                {form.data.enabled ? "Anyone with the link can send you an enquiry." : "The link shows a 'not available' page."}
              </p>
            </div>
            {editable && (
              <Button
                variant="secondary"
                loading={toggle.isPending}
                onClick={() =>
                  toggle.mutate(!form.data.enabled, {
                    onError: (err) => toast(errorMessage(err), "error"),
                  })
                }
              >
                {form.data.enabled ? "Switch off" : "Switch on"}
              </Button>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
