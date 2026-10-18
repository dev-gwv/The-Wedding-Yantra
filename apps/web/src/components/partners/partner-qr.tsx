"use client";

import { useCreatePartner } from "@wedding-yantra/api-client/react";
import type { Partner, PartnerSummary, VendorSummary } from "@wedding-yantra/types";
import { ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { downloadQrPng } from "@/components/ui/qr-download";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";

const origin = () => (typeof window === "undefined" ? "" : window.location.origin);

/** The enquiry form's link; with a partner's code, enquiries through it are theirs. */
export function enquiryFormUrl(slug: string | null | undefined, partnerCode?: string) {
  if (!slug) return "";
  return `${origin()}/f/${slug}${partnerCode ? `?p=${partnerCode}` : ""}`;
}

/** What's printed under a partner's QR code. */
export function partnerQrText(businessName: string, p: Pick<PartnerSummary, "name">) {
  return { filename: `${businessName} x ${p.name} QR`, title: businessName, subtitle: `Scan to enquire · via ${p.name}` };
}

/** A QR code as an SVG string, made in the browser. */
export function useQrSvg(text: string) {
  // Kept with the text it was made for, so a changed link never shows the old code.
  const [made, setMade] = useState<{ text: string; svg: string | null } | null>(null);
  useEffect(() => {
    if (!text) return;
    let live = true;
    QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#241803", light: "#FFFFFF" } })
      .then((svg) => live && setMade({ text, svg }))
      .catch(() => live && setMade({ text, svg: null }));
    return () => {
      live = false;
    };
  }, [text]);
  return made?.text === text ? made.svg : null;
}

export function QrImage({ text, label, className }: { text: string; label: string; className?: string }) {
  const svg = useQrSvg(text);
  return (
    <div
      className={cn("shrink-0 rounded-2xl border border-line bg-white p-2 [&_svg]:size-full", className)}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/** How the printed card looks: the same layout as the HD download. */
export function QrPoster({ text, title, subtitle }: { text: string; title: string; subtitle: string }) {
  return (
    <div className="w-full max-w-60 shrink-0 rounded-3xl border border-line bg-white p-5 text-center text-[#241803] shadow-soft">
      <QrImage text={text} label={`QR code: ${subtitle}`} className="aspect-square w-full border-0 p-0" />
      <p className="mt-4 font-display text-lg font-extrabold leading-tight">{title}</p>
      <p className="mt-1 text-sm text-[#5c4a2a]">{subtitle}</p>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function partnerCounts(p: Pick<PartnerSummary, "scans" | "enquiries" | "booked">) {
  return [plural(p.scans, "scan", "scans"), plural(p.enquiries, "enquiry", "enquiries"), p.booked ? `${p.booked} booked` : null].filter(Boolean).join(" · ");
}

/** One partner in a list: their QR, what it brought in, and a download for print. */
export function PartnerQrRow({ p, slug }: { p: PartnerSummary; slug: string | null }) {
  const { workspace } = useCurrentWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const url = enquiryFormUrl(slug, p.code);
  const print = partnerQrText(workspace.name, p);

  async function download() {
    setBusy(true);
    try {
      await downloadQrPng(url, print.filename, print.title, print.subtitle);
      toast(`${p.name}'s QR code downloaded, ready to print`);
    } catch {
      toast("Couldn't download the QR code. Please try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Link href={`/app/partners/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        {url ? <QrImage text={url} label={`QR code for ${p.name}`} className="size-14 rounded-xl p-1" /> : <span className="size-14 shrink-0 rounded-xl bg-cream" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{p.name}</span>
          <span className="block truncate text-sm text-ink-muted">{[p.label, partnerCounts(p)].filter(Boolean).join(" · ")}</span>
        </span>
        <ChevronRight className="hidden size-4 shrink-0 text-ink-subtle sm:block" />
      </Link>
      {url && (
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          aria-label={`Download ${p.name}'s QR code`}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-line text-brand-strong hover:bg-cream disabled:opacity-50"
        >
          <Download className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Makes a vendor their own partner QR code in one tap: their name, number and what they do. */
export function useMakeVendorQr(onMade: (p: Partner) => void) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreatePartner(workspace.id);
  const toast = useToast();
  const [making, setMaking] = useState<string | null>(null);
  async function make(v: Pick<VendorSummary, "id" | "name" | "phone" | "service">) {
    setMaking(v.id);
    try {
      const p = await create.mutateAsync({ name: v.name, label: v.service?.slice(0, 60) ?? null, phone: v.phone ?? null, vendorId: v.id });
      toast(`QR code made for ${v.name}`);
      onMade(p);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setMaking(null);
    }
  }
  return { make, making };
}
