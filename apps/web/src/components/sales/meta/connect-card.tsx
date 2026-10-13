"use client";

import { BookOpen, Check, Megaphone } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, GradientTile } from "@/components/ui/misc";
import { APP_GUIDE_PATH } from "@/lib/facebook-guide";
import type { MetaActions } from "./use-meta-actions";

const POINTS = [
  "Each lead goes to the salesperson with the fewest open leads, with an alert on their phone.",
  "Someone who fills a form again within 30 days is added to their open enquiry, not made twice.",
  "Every answer on the form is kept on the lead, word for word.",
  "Nothing is posted on your Page.",
];

/** Before Facebook is connected: what it does, and one big button. */
export function ConnectCard({ actions }: { actions: MetaActions }) {
  return (
    <Card className="p-5 sm:p-6">
      <GradientTile icon={Megaphone} />
      <h2 className="mt-4 font-display text-xl font-extrabold">Your lead ads, straight into Leads</h2>
      <p className="mt-1 text-[15px] text-ink-muted">
        Leads from your Facebook and Instagram forms arrive here in seconds, given to your salespeople, with an alert.
      </p>
      <ul className="mt-4 space-y-2">
        {POINTS.map((p) => (
          <li key={p} className="flex gap-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={3} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Button size="lg" className="mt-6" loading={actions.connecting} onClick={() => void actions.goToFacebook()}>
        Continue with Facebook
      </Button>
      <p className="mt-3 text-center text-sm text-ink-muted">You&apos;ll log in to Facebook and tick the Page your lead ads run from.</p>
      <Link
        href={APP_GUIDE_PATH}
        className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-cream px-4 py-3 text-sm font-bold text-brand-strong hover:bg-sun-100"
      >
        <BookOpen className="size-4" /> First time? Step-by-step guide, with pictures
      </Link>
    </Card>
  );
}
