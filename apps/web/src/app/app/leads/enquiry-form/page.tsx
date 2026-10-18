"use client";

import { can, leadScope, whatsappLink } from "@wedding-yantra/core";
import { useLeadForm, usePartners, useSetLeadFormEnabled, useVendors } from "@wedding-yantra/api-client/react";
import { ChevronRight, Copy, ExternalLink, Handshake, Lock, MessageCircle, Plus, QrCode, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { PartnerFormSheet } from "@/components/partners/partner-form-sheet";
import { enquiryFormUrl, PartnerQrRow, QrPoster, useMakeVendorQr } from "@/components/partners/partner-qr";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { QrDownloadButtons } from "@/components/ui/qr-download";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

const SUBTITLE = "Scan to send us your enquiry";
const VENDORS_SHOWN = 5;

/** Where enquiries come in from: the business's own form and QR, and one QR per partner or vendor. */
export default function EnquiryFormPage() {
  const { workspace } = useCurrentWorkspace();
  const form = useLeadForm(workspace.id, leadScope(workspace) !== "none");
  const toggle = useSetLeadFormEnabled(workspace.id);
  const toast = useToast();
  const editable = can(workspace, "leads.view_all");

  if (leadScope(workspace) === "none")
    return (
      <>
        <BackLink href="/app/leads" label="Leads" />
        <PageHeader title="Enquiry form & QR codes" />
        <Card>
          <EmptyState icon={Lock} title="Leads aren't on your screens">
            Ask the owner to add Leads & follow-ups for you.
          </EmptyState>
        </Card>
      </>
    );

  const url = enquiryFormUrl(form.data?.slug);

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
      <BackLink href="/app/leads" label="Leads" />
      <PageHeader title="Enquiry form & QR codes" subtitle="Share one link or QR code. Every enquiry comes into Leads, due today." />
      {form.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {form.isError && <Notice tone="danger">{errorMessage(form.error)}</Notice>}
      {form.data && (
        <div className="space-y-6">
          <Card className="flex items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-bold">
                <span className={form.data.enabled ? "size-2.5 shrink-0 rounded-full bg-success" : "size-2.5 shrink-0 rounded-full bg-line-strong"} aria-hidden />
                {form.data.enabled ? "Accepting enquiries" : "Switched off"}
              </p>
              <p className="text-sm text-ink-muted">
                {form.data.enabled ? "Anyone with the link or a QR code can send you an enquiry." : "The link and every QR code show a 'not available' page."}
              </p>
            </div>
            {editable && (
              <Switch
                checked={form.data.enabled}
                label="Accept enquiries through the form"
                disabled={toggle.isPending}
                onChange={(on) =>
                  toggle.mutate(on, {
                    onSuccess: () => toast(on ? "Form switched on" : "Form switched off"),
                    onError: (err) => toast(errorMessage(err), "error"),
                  })
                }
              />
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
              <QrCode className="size-5 text-brand-strong" /> Your QR code
            </h2>
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <QrPoster text={url} title={workspace.name} subtitle={SUBTITLE} />
              <div className="w-full min-w-0 flex-1 space-y-4">
                <p className="text-[15px] text-ink-muted">
                  Print it for your studio, stall or wedding expo. People scan it, fill in their details, and the enquiry is in Leads at once.
                </p>
                <QrDownloadButtons text={url} filename={`${workspace.name} enquiry QR`} title={workspace.name} subtitle={SUBTITLE} />
                <div>
                  <p className="text-sm font-semibold text-ink-muted">Or share the link</p>
                  <p className="mt-1 break-all rounded-xl bg-cream px-3 py-2 text-sm font-bold">{url}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={whatsappLink(`Tell us about your event and we'll get back to you: ${url}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonClass({ variant: "secondary", size: "sm" })}
                    >
                      <MessageCircle className="size-4" /> WhatsApp
                    </a>
                    <Button variant="secondary" size="sm" onClick={copy}>
                      <Copy className="size-4" /> Copy link
                    </Button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary", size: "sm" })}>
                      <ExternalLink className="size-4" /> Open form
                    </a>
                  </div>
                </div>
                <p className="text-sm text-ink-muted">
                  The form asks for name, mobile, event, date, city and a note. Put the link in your Instagram bio, WhatsApp Business profile and Google listing.
                </p>
              </div>
            </div>
          </Card>

          {editable && <PartnerCodes slug={form.data.slug} formOn={form.data.enabled} />}
        </div>
      )}
    </>
  );
}

/** One QR code for each partner or vendor, so you see who sends you work. */
function PartnerCodes({ slug, formOn }: { slug: string; formOn: boolean }) {
  const { workspace } = useCurrentWorkspace();
  const router = useRouter();
  const partners = usePartners(workspace.id);
  const vendors = useVendors(workspace.id, can(workspace, "finance.view"));
  const [adding, setAdding] = useState(false);
  const [allVendors, setAllVendors] = useState(false);
  const { make, making } = useMakeVendorQr((p) => router.push(`/app/partners/${p.id}`));

  const list = partners.data ?? [];
  const totals = list.reduce((a, p) => ({ scans: a.scans + p.scans, enquiries: a.enquiries + p.enquiries, booked: a.booked + p.booked }), { scans: 0, enquiries: 0, booked: 0 });
  const withQr = new Set(list.map((p) => p.vendorId).filter(Boolean));
  const noQr = (vendors.data ?? []).filter((v) => !withQr.has(v.id));
  const shownVendors = allVendors ? noQr : noQr.slice(0, VENDORS_SHOWN);

  return (
    <>
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
              <Handshake className="size-5 text-brand-strong" /> A QR code for each partner or vendor
            </h2>
            <p className="text-sm text-ink-muted">Each has its own code. Enquiries through it are marked as theirs, so you see who sends you work.</p>
          </div>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add partner
          </Button>
        </div>
        {!formOn && list.length > 0 && (
          <div className="mb-3">
            <Notice tone="warning">The form is switched off, so these QR codes show a &quot;not available&quot; page.</Notice>
          </div>
        )}
        {partners.isPending && (
          <div className="flex justify-center py-8 text-brand">
            <Spinner />
          </div>
        )}
        {partners.isError && <Notice tone="danger">{errorMessage(partners.error)}</Notice>}
        {partners.data &&
          (list.length === 0 ? (
            <Card>
              <EmptyState icon={QrCode} title="No partner QR codes yet" action={<Button onClick={() => setAdding(true)}>Add your first partner</Button>}>
                A boutique, jeweller, salon or venue keeps your QR at their counter. Their enquiries are marked as theirs, and they can see them too.
              </EmptyState>
            </Card>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-3 gap-3">
                {(
                  [
                    ["Scans", totals.scans],
                    ["Enquiries", totals.enquiries],
                    ["Booked", totals.booked],
                  ] as const
                ).map(([label, n]) => (
                  <Card key={label} className="p-4">
                    <p className="font-display text-2xl font-extrabold tabular">{n}</p>
                    <p className="text-sm text-ink-muted">{label}</p>
                  </Card>
                ))}
              </div>
              <Card className="divide-y divide-line overflow-hidden">
                {list.map((p) => (
                  <PartnerQrRow key={p.id} p={p} slug={slug} />
                ))}
                <Link href="/app/partners" className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-bold text-brand-strong hover:bg-cream">
                  All partners, and ones you&apos;ve ended
                  <ChevronRight className="size-4" />
                </Link>
              </Card>
            </>
          ))}
      </section>

      {noQr.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Store className="size-5 text-brand-strong" /> Your vendors
          </h2>
          <p className="mb-3 text-sm text-ink-muted">Give a vendor you work with their own QR code in one tap. Enquiries from it are marked as theirs.</p>
          <Card className="divide-y divide-line overflow-hidden">
            {shownVendors.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{v.name}</span>
                  {(v.service || v.city) && <span className="block truncate text-sm text-ink-muted">{[v.service, v.city].filter(Boolean).join(" · ")}</span>}
                </span>
                <Button size="sm" variant="secondary" loading={making === v.id} disabled={!!making} onClick={() => void make(v)}>
                  <QrCode className="size-4" /> Make QR
                </Button>
              </div>
            ))}
            {noQr.length > VENDORS_SHOWN && (
              <button type="button" onClick={() => setAllVendors((o) => !o)} className="w-full px-5 py-3 text-left text-sm font-bold text-brand-strong hover:bg-cream">
                {allVendors ? "Show fewer" : `Show all ${noQr.length} vendors`}
              </button>
            )}
          </Card>
        </section>
      )}

      <PartnerFormSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(p) => {
          setAdding(false);
          router.push(`/app/partners/${p.id}`);
        }}
      />
    </>
  );
}
