import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { Notice } from "@/components/ui/misc";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const LEGAL_LINKS: [string, string][] = [
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/refunds", "Refunds and cancellations"],
];

/** The privacy, terms and refunds pages: one readable column in the website's style. */
export function LegalPage({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <div className="min-h-dvh bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <Notice tone="warning">
          <strong>Draft: to be reviewed before launch.</strong> This text is a starting point, not legal advice. Words in
          [square brackets] are still to be filled in.
        </Notice>

        <h1 className="mt-6 font-display text-[clamp(32px,6vw,48px)] font-extrabold leading-tight">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated: [Date]</p>
        <div className="mt-4 text-lg leading-relaxed text-ink-muted">{intro}</div>

        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full bg-cream px-4 py-2 text-sm font-bold text-ink hover:bg-sun-100">
              {s.title}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-6">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6 rounded-3xl border border-line p-6 shadow-soft">
              <h2 className="font-display text-xl font-extrabold sm:text-2xl">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3 leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">{s.body}</div>
            </section>
          ))}
        </div>

        <nav aria-label="Policies" className="mt-12 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {LEGAL_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="font-semibold text-brand-strong hover:text-brand-deep">
              {label}
            </Link>
          ))}
          <Link href="/" className="font-semibold text-brand-strong hover:text-brand-deep">
            Home
          </Link>
        </nav>
      </main>
    </div>
  );
}

/** Who runs the service, as it appears on every policy. To be filled in before launch. */
export const COMPANY = {
  name: "[Business legal name]",
  address: "[Registered address]",
  email: "[Support email]",
  grievanceName: "[Grievance officer name]",
  grievanceEmail: "[Grievance officer email]",
  city: "[City]",
};
