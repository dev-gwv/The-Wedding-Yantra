import { TRIAL_DAYS } from "@wedding-yantra/core";
import {
  CalendarCheck,
  Gauge,
  IndianRupee,
  Inbox,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BusinessIcon } from "@/components/app/business-icon";
import { Logo } from "@/components/app/logo";
import { Pricing } from "@/components/site/pricing";
import { SiteHeader } from "@/components/site/site-header";
import { buttonClass } from "@/components/ui/button";
import { Card, IconSquare } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: { absolute: "Wedding Yantra: run your wedding business from one app" },
  description:
    "Enquiries, quotes, GST bills, payments, your team and your profit, in one app for makeup artists, decorators, photographers, caterers and every wedding business in India.",
};

const TRADES: [string, string][] = [
  ["sparkles", "Makeup artists"],
  ["hand", "Mehendi artists"],
  ["clipboard-list", "Wedding planners"],
  ["flower-2", "Decorators"],
  ["camera", "Photographers and filmmakers"],
  ["clapperboard", "Content creators"],
  ["speaker", "Sound, lighting and DJs"],
  ["utensils", "Caterers"],
  ["wine", "Bar services"],
  ["gift", "Gifting and hampers"],
  ["music", "Choreographers"],
  ["flame", "Fireworks and effects"],
  ["party-popper", "Birthday and event decor"],
  ["briefcase", "Every other wedding business"],
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Inbox,
    title: "Enquiries that don't slip",
    body: "Every enquiry in one place, with who follows up and when. Ready WhatsApp replies, and a form link for your Instagram bio.",
  },
  {
    icon: ReceiptText,
    title: "Quotes clients accept online",
    body: "Pick from your price list, share the link on WhatsApp, and the client accepts with a tap. The booking and the event are made for you.",
  },
  {
    icon: IndianRupee,
    title: "GST bills and payments",
    body: "Bills numbered for the financial year, with CGST, SGST or IGST worked out, a UPI QR on every bill, and polite reminders for what's due.",
  },
  {
    icon: CalendarCheck,
    title: "Events and your team",
    body: "A calendar that warns about clashes, a checklist for every event, who works it and when they must reach, and who's off.",
  },
  {
    icon: Gauge,
    title: "Know your profit",
    body: "Expenses with bill photos, profit on every event, and a monthly report with spreadsheets your CA can open straight away.",
  },
  {
    icon: ListChecks,
    title: "A team that runs itself",
    body: "Everyone sees their own day. Scores are worked out from the work itself, and the day's summary goes out on WhatsApp.",
  },
];

const FAQ: [string, string][] = [
  [
    "Do I need a GST number?",
    "No. Without one, your bills simply don't charge GST. Add your GSTIN later and the next bills show CGST and SGST, or IGST for other states.",
  ],
  ["Does it work on my phone?", "Yes. It's made for the phone first. Add it to your home screen and it opens like any other app."],
  ["Can my team use it?", "Yes. Staff see their own day and tasks, freelancers see only the events they're booked on, and your accountant sees the money, read-only."],
  [
    "Is my data safe?",
    "Every business's data is kept apart, and it's backed up every night, bill photos included. Your data is yours: the monthly spreadsheets take it anywhere.",
  ],
  ["What happens after the free trial?", `You try everything free for ${TRIAL_DAYS} days, no card needed. Then pick the plan that fits.`],
];

/** The public website: what Wedding Yantra does, for whom, and what it costs. */
export default function HomePage() {
  return (
    <div className="min-h-dvh bg-surface">
      <div className="bg-hero">
        <SiteHeader />
        <section className="mx-auto max-w-4xl px-4 pb-20 pt-10 text-center sm:px-6 sm:pt-16">
          <span className="inline-flex items-center rounded-full bg-surface/80 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-strong ring-1 ring-sun-300/60">
            For every wedding business in India
          </span>
          <h1 className="mt-5 font-display text-[clamp(38px,7vw,64px)] font-extrabold leading-[1.05] tracking-tight text-ink">
            {/* On phones the glow sits right behind the headline, so the gradient words wait for wider screens. */}
            Run your wedding business from <span className="sm:text-gradient">one app</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-muted">
            Enquiries, quotes, GST bills, payments, your team and your profit. Made for the way makeup artists, decorators, photographers, caterers and
            planners really work.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login" className={buttonClass({ size: "lg", className: "w-full sm:w-auto sm:px-8" })}>
              Start free for {TRIAL_DAYS} days
            </Link>
            <a href="#pricing" className={buttonClass({ variant: "secondary", size: "lg", className: "w-full sm:w-auto sm:px-8" })}>
              See prices
            </a>
          </div>
          <p className="mt-3 text-sm text-ink-muted">No card needed. Set up in two minutes.</p>
        </section>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center font-display text-3xl font-extrabold">Made for your trade</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-ink-muted">
          Pick what you do and it comes ready: your usual services and prices, your sales stages and the checklist for every event.
        </p>
        <ul className="mt-8 flex flex-wrap justify-center gap-2">
          {TRADES.map(([icon, name]) => (
            <li key={name} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold shadow-soft">
              <BusinessIcon name={icon} className="size-4 text-brand-strong" />
              {name}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-cream/60 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center font-display text-3xl font-extrabold">Everything from the first call to the final payment</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title} className="p-6">
                <IconSquare icon={f.icon} />
                <h3 className="mt-4 font-display text-lg font-extrabold">{f.title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-muted">{f.body}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <h2 className="text-center font-display text-3xl font-extrabold">Up and running today</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            ["Pick your trade", "Your price list, sales stages and event checklist are set up for you. Change anything."],
            ["Add your enquiries", "Type them in, or share your enquiry form. Follow-ups due today are on Home every morning."],
            ["Bring your team", "Invite them by phone. Each person sees exactly what their role needs."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-3xl border border-line p-6">
              <span className="grid size-10 place-items-center rounded-xl bg-gradient-primary font-display text-lg font-extrabold text-on-brand">{i + 1}</span>
              <h3 className="mt-4 font-display text-lg font-extrabold">{title}</h3>
              <p className="mt-1.5 leading-relaxed text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="pricing" className="scroll-mt-4 bg-cream/60 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center font-display text-3xl font-extrabold">Simple prices</h2>
          <p className="mx-auto mb-8 mt-2 max-w-xl text-center text-ink-muted">One price for the whole business, not per person. Change or stop any time.</p>
          <Pricing />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-center font-display text-3xl font-extrabold">Questions</h2>
        <div className="mt-8 divide-y divide-line rounded-3xl border border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-6 py-4">
              <summary className="cursor-pointer list-none font-bold marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {q}
                  <span className="text-brand-strong transition group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 leading-relaxed text-ink-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-hero">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <h2 className="font-display text-3xl font-extrabold">Your next booking deserves better than a notebook</h2>
          <div className="mt-6 flex flex-col items-center justify-center gap-4 text-sm font-semibold text-ink-muted sm:flex-row sm:gap-8">
            <span className="inline-flex items-center gap-2">
              <Smartphone className="size-4 text-brand-strong" /> Works on any phone
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand-strong" /> Backed up every night
            </span>
          </div>
          <Link href="/login" className={buttonClass({ size: "lg", className: "mt-8 w-full sm:w-auto sm:px-10" })}>
            Start free for {TRIAL_DAYS} days
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-ink-muted sm:flex-row sm:px-6">
        <Logo className="[&_svg]:size-7 [&>span:last-child]:text-base" />
        <span>Made in India for wedding businesses.</span>
        <Link href="/login" className="font-semibold text-brand-strong hover:text-brand-deep">
          Sign in
        </Link>
      </footer>
    </div>
  );
}
