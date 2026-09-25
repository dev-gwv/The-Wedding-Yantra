"use client";

import { formatDate, formatMoney, upiLink, whatsappLink } from "@wedding-yantra/core";
import { usePublicBill } from "@wedding-yantra/api-client/react";
import { CircleCheck, Copy, FileX, MessageCircle, Printer, Smartphone } from "lucide-react";
import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/app/logo";
import { BillDocument } from "@/components/money/bill-document";
import { Button, buttonClass } from "@/components/ui/button";
import { EmptyState, NextStepCard, Notice } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";

/** The bill link a business sends its client: see the bill, pay the balance by UPI. */
export default function PublicBillPage() {
  const { token } = useParams<{ token: string }>();
  const data = usePublicBill(token);

  if (data.isPending) return <Splash />;
  if (data.isError) {
    return (
      <main className="grid min-h-dvh place-items-center bg-hero px-4">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-soft">
          <EmptyState icon={FileX} title="This bill isn't available" className="py-6">
            The link may be old. Please ask the business to send it again.
          </EmptyState>
        </div>
      </main>
    );
  }

  const { business, bill } = data.data;
  const cancelled = bill.status === "cancelled";

  return (
    <div className="min-h-dvh bg-cream print:bg-surface">
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10 print:p-0">
        {cancelled && (
          <div className="mb-5 print:hidden">
            <Notice tone="warning">This bill was cancelled. {business.name} will send you the new one.</Notice>
          </div>
        )}
        {!cancelled && bill.due === 0 && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-success-soft px-4 py-3 font-semibold text-success print:hidden">
            <CircleCheck className="size-5 shrink-0" /> Paid in full. Thank you!
          </div>
        )}
        {!cancelled && bill.due > 0 && (
          <PayCard
            due={bill.due}
            dueDate={bill.dueDate}
            overdue={bill.overdue}
            number={bill.number}
            business={business.name}
            businessPhone={business.phone}
            upiId={business.upiId}
          />
        )}

        <BillDocument business={business} bill={bill} />

        <div className="mt-5 flex items-center justify-between gap-3 print:hidden">
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <LogoMark className="size-5" /> Sent with Wedding Yantra
          </p>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" /> Save as PDF
          </Button>
        </div>
      </main>
    </div>
  );
}

/**
 * The balance and how to pay it. On a phone, the button opens any UPI app with the
 * amount filled in; on a computer, the QR code does the same from the phone's camera.
 */
function PayCard({
  due,
  dueDate,
  overdue,
  number,
  business,
  businessPhone,
  upiId,
}: {
  due: number;
  dueDate: string | null;
  overdue: boolean;
  number: string;
  business: string;
  businessPhone: string | null;
  upiId: string | null;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = upiId ? upiLink({ upiId, payee: business, amount: due, note: number }) : null;

  useEffect(() => {
    if (!link) return;
    QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#241803", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  async function copyUpi() {
    if (!upiId) return;
    try {
      await navigator.clipboard.writeText(upiId);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const paidMessage = whatsappLink(`Hi, I have paid ${formatMoney(due)} for bill ${number}. Sharing the payment screenshot.`, businessPhone ?? undefined);

  return (
    <NextStepCard className="mb-5 p-5 sm:p-6 print:hidden">
      <p className="text-sm font-semibold text-ink-muted">Balance due{dueDate ? ` by ${formatDate(dueDate)}` : ""}</p>
      <p className={`font-display text-4xl font-extrabold tabular ${overdue ? "text-danger" : ""}`}>{formatMoney(due)}</p>
      {link ? (
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex-1 space-y-3">
            <a href={link} className={buttonClass({ size: "lg" })}>
              <Smartphone className="size-5" /> Pay {formatMoney(due)} by UPI
            </a>
            <p className="text-sm text-ink-muted">Opens GPay, PhonePe, Paytm or any UPI app with the amount filled in.</p>
            <button type="button" onClick={copyUpi} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-strong">
              <Copy className="size-4" /> {copied ? "UPI ID copied" : `UPI ID: ${upiId}`}
            </button>
          </div>
          <div className="flex items-center gap-4 sm:flex-col sm:gap-2">
            <div
              className="size-36 shrink-0 rounded-2xl border border-line bg-surface p-2 [&_svg]:size-full"
              role="img"
              aria-label="QR code to pay by UPI"
              dangerouslySetInnerHTML={qr ? { __html: qr } : undefined}
            />
            <p className="max-w-40 text-xs text-ink-muted sm:text-center">On a computer? Scan with your phone&apos;s UPI app.</p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Please pay {business} by bank transfer or UPI using the details on the bill.</p>
      )}
      {businessPhone && (
        <a href={paidMessage} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-strong">
          <MessageCircle className="size-4" /> Paid? Tell {business} on WhatsApp
        </a>
      )}
    </NextStepCard>
  );
}
