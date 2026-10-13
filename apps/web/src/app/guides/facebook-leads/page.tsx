import type { Metadata } from "next";
import Link from "next/link";
import { FacebookGuide } from "@/components/guides/facebook-guide";
import { ShareGuide } from "@/components/guides/share-guide";
import { SiteHeader } from "@/components/site/site-header";
import { buttonClass } from "@/components/ui/button";
import { APP_GUIDE_PATH, GUIDE_INTRO, GUIDE_TITLE, guideVideo } from "@/lib/facebook-guide";

export const metadata: Metadata = {
  title: "Connect Facebook & Instagram lead ads",
  description: "Step by step: get the leads from your Facebook and Instagram lead forms into Wedding Yantra by themselves.",
};

/**
 * The Facebook guide for anyone with the link: the owner, or the person or agency who runs
 * their ads. No sign-in needed.
 */
export default function FacebookLeadsGuidePage() {
  return (
    <div className="min-h-dvh bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <p className="text-sm font-bold text-brand-strong">
          <Link href="/help" className="hover:text-brand-deep">
            Help
          </Link>{" "}
          · Facebook & Instagram leads
        </p>
        <h1 className="mt-2 font-display text-[clamp(30px,6vw,44px)] font-extrabold leading-tight">{GUIDE_TITLE}</h1>
        <div className="mt-3 space-y-1 text-lg text-ink-muted">
          {GUIDE_INTRO.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div className="mt-6">
          <FacebookGuide mode="public" video={guideVideo()} share={<ShareGuide />} />
        </div>
        <div className="mt-10 rounded-3xl border border-sun-300/60 bg-cream p-6 text-center">
          <p className="font-display text-xl font-extrabold">Ready? Connect in Wedding Yantra</p>
          <p className="mt-1 text-ink-muted">The business owner signs in and opens Leads.</p>
          <Link href={`/login?next=${encodeURIComponent(APP_GUIDE_PATH)}`} className={buttonClass({ className: "mt-4" })}>
            Open Wedding Yantra
          </Link>
        </div>
      </main>
    </div>
  );
}
