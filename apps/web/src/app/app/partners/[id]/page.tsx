"use client";

import { firstName, formatPhone, whatsappLink } from "@wedding-yantra/core";
import { useLeadForm, usePartner, useSetPartnerSharing, useUpdatePartner } from "@wedding-yantra/api-client/react";
import type { Partner } from "@wedding-yantra/types";
import { Archive, ArchiveRestore, Copy, ExternalLink, Handshake, Link2, Link2Off, MessageCircle, Pencil, RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { PartnerFormSheet } from "@/components/partners/partner-form-sheet";
import { LeadCard } from "@/components/sales/lead-card";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/misc";
import { QrDownloadButtons } from "@/components/ui/qr-download";
import { Splash } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

export default function PartnerPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useCurrentWorkspace();
  const partner = usePartner(workspace.id, id);
  const form = useLeadForm(workspace.id);

  if (partner.isPending || form.isPending) return <Splash />;
  if (partner.isError)
    return (
      <>
        <BackLink href="/app/partners" label="Partner QR codes" />
        <Notice tone="danger">{errorMessage(partner.error)}</Notice>
      </>
    );
  return <PartnerView p={partner.data} slug={form.data?.slug ?? null} formOn={form.data?.enabled ?? false} />;
}

function PartnerView({ p, slug, formOn }: { p: Partner; slug: string | null; formOn: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdatePartner(workspace.id);
  const sharing = useSetPartnerSharing(workspace.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const enquiryUrl = slug ? `${origin}/f/${slug}?p=${p.code}` : "";
  const pageUrl = p.viewToken ? `${origin}/p/${p.viewToken}` : "";

  useEffect(() => {
    if (!enquiryUrl) return;
    QRCode.toString(enquiryUrl, { type: "svg", margin: 1, color: { dark: "#241803", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [enquiryUrl]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  }

  const act = (fn: () => Promise<unknown>, message: string) =>
    fn()
      .then(() => toast(message))
      .catch((err) => toast(errorMessage(err), "error"));

  const pageMessage = `Hi ${firstName(p.name)}, here is your page for enquiries that come to ${workspace.name} through your QR code. You can see each one and where it stands: ${pageUrl}`;

  return (
    <div className="space-y-6">
      <BackLink href="/app/partners" label="Partner QR codes" />
      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-on-brand shadow-soft">
            <Handshake className="size-7" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(24px,4vw,32px)] font-extrabold leading-tight">{p.name}</h1>
            <p className="text-ink-muted">{[p.label, p.vendorName && p.vendorName !== p.name ? `Vendor: ${p.vendorName}` : null, p.phone && formatPhone(p.phone)].filter(Boolean).join(" · ")}</p>
            {p.archived && <span className="mt-1 inline-block rounded-full bg-cream px-2.5 py-0.5 text-xs font-bold text-ink-subtle">Partnership ended</span>}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {(
            [
              ["Scans", p.scans],
              ["Enquiries", p.enquiries],
              ["Booked", p.booked],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="rounded-2xl bg-cream p-4">
              <p className="font-display text-2xl font-extrabold tabular">{n}</p>
              <p className="text-xs font-semibold text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Edit
          </Button>
        </div>
        {p.notes && <p className="mt-4 whitespace-pre-line rounded-2xl bg-cream p-4">{p.notes}</p>}
      </Card>

      {!p.archived && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-lg font-extrabold">Their QR code</h2>
          {!formOn && (
            <div className="mt-3">
              <Notice tone="warning">Your enquiry form is switched off, so this QR shows a &quot;not available&quot; page. Switch it on in More, Enquiry form.</Notice>
            </div>
          )}
          <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <div
              className="size-44 shrink-0 rounded-2xl border border-line bg-surface p-2 [&_svg]:size-full"
              role="img"
              aria-label={`QR code for ${p.name}`}
              dangerouslySetInnerHTML={qr ? { __html: qr } : undefined}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-[15px] text-ink-muted">
                Print it for {p.name}&apos;s counter, trial room or table. People scan it, fill in your enquiry form, and the enquiry is marked as theirs.
              </p>
              <QrDownloadButtons text={enquiryUrl} filename={`${workspace.name} x ${p.name} QR`} title={workspace.name} subtitle={`Scan to enquire · via ${p.name}`} />
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 break-all font-semibold text-ink-muted">{enquiryUrl}</span>
                <button type="button" onClick={() => void copy(enquiryUrl, "Enquiry link")} className="inline-flex items-center gap-1 font-bold text-brand-strong">
                  <Copy className="size-3.5" /> Copy
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!p.archived && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-lg font-extrabold">{firstName(p.name)}&apos;s page</h2>
          <p className="mt-1 text-[15px] text-ink-muted">
            A private link where {p.name} sees every enquiry from their QR code and where it stands: new, in talks, booked or not booked. Never prices or payments.
          </p>
          {p.sharing ? (
            <>
              <p className="mt-4 break-all rounded-xl bg-cream px-3 py-2 text-sm font-semibold">{pageUrl}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={whatsappLink(pageMessage, p.phone ?? undefined)} target="_blank" rel="noopener noreferrer" className={buttonClass()}>
                  <MessageCircle className="size-4" /> Send on WhatsApp
                </a>
                <Button variant="secondary" onClick={() => void copy(pageUrl, "Page link")}>
                  <Copy className="size-4" /> Copy link
                </Button>
                <a href={pageUrl} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })}>
                  <ExternalLink className="size-4" /> See their page
                </a>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" loading={sharing.isPending} onClick={() => void act(() => sharing.mutateAsync({ id: p.id, on: true }), "New link made. The old one no longer works.")}>
                  <RefreshCw className="size-4" /> New link
                </Button>
                <Button variant="ghost" size="sm" loading={sharing.isPending} onClick={() => void act(() => sharing.mutateAsync({ id: p.id, on: false }), "Sharing stopped. Their link no longer works.")}>
                  <Link2Off className="size-4" /> Stop sharing
                </Button>
              </div>
            </>
          ) : (
            <Button className="mt-4" loading={sharing.isPending} onClick={() => void act(() => sharing.mutateAsync({ id: p.id, on: true }), "Their page is on")}>
              <Link2 className="size-4" /> Make their page link
            </Button>
          )}
          <label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-line px-4 py-3">
            <span>
              <span className="block font-semibold">Show full phone numbers</span>
              <span className="block text-sm text-ink-muted">{p.showPhone ? "They see each client's number in full." : "Numbers show as 98xxxxx123, enough to recognise, not to call."}</span>
            </span>
            <Switch
              checked={p.showPhone}
              label="Show full phone numbers to this partner"
              disabled={update.isPending}
              onChange={(on) => void act(() => update.mutateAsync({ id: p.id, showPhone: on }), on ? "Numbers shown in full" : "Numbers masked")}
            />
          </label>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-extrabold">Enquiries from {p.name}</h2>
        {p.leads.length === 0 ? (
          <p className="text-ink-muted">None yet. They show here the moment someone enquires through this QR code.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {p.leads.map((l) => (
              <LeadCard key={l.id} lead={l} showStage />
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-line pt-6">
        <Button
          variant="ghost"
          size="sm"
          loading={update.isPending}
          onClick={() =>
            void act(
              () => update.mutateAsync({ id: p.id, archived: !p.archived }),
              p.archived ? "Partner brought back" : "Partnership ended. Their QR still opens your form, uncredited.",
            )
          }
        >
          {p.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {p.archived ? "Bring back" : "End partnership"}
        </Button>
      </div>

      <PartnerFormSheet
        open={editing}
        partner={p}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          toast("Partner saved");
        }}
      />
    </div>
  );
}
