"use client";

import { whatsappLink } from "@wedding-yantra/core";
import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { useOrigin } from "@/lib/device-flag";
import { GUIDE_PATH, guideShareText } from "@/lib/facebook-guide";

/**
 * "Send this guide on WhatsApp", for the person or agency who runs the ads. It always sends
 * the public guide, which opens without signing in.
 */
export function ShareGuide({ note }: { note?: string }) {
  const origin = useOrigin();
  const url = origin ? `${origin}${GUIDE_PATH}` : null;
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard blocked: the link is shown below to press and hold.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-3xl border border-line bg-cream/60 p-4 sm:p-5">
      <p className="font-bold">Does someone else run your Facebook ads?</p>
      <p className="mt-1 text-sm text-ink-muted">{note ?? "Send them this guide. It opens without a Wedding Yantra login."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={url ? whatsappLink(guideShareText(url)) : undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!url}
          className={buttonClass({ variant: "secondary" })}
        >
          <MessageCircle className="size-4" /> Send this guide on WhatsApp
        </a>
        <Button variant="ghost" onClick={() => void copy()} disabled={!url}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Link copied" : "Copy link"}
        </Button>
      </div>
      {url && <p className="mt-2 select-all break-all text-xs text-ink-muted">{url}</p>}
    </div>
  );
}
