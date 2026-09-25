import { ROLE_INFO, ROLES, TRIAL_DAYS } from "@wedding-yantra/core";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Help",
  description: "How to use Wedding Yantra: enquiries, quotes, GST bills, payments, events, your team and your reports.",
};

interface Guide {
  id: string;
  title: string;
  steps: string[];
}

const GUIDES: Guide[] = [
  {
    id: "start",
    title: "Getting started",
    steps: [
      "Sign in with your mobile number. We send you a code; there's no password to remember.",
      "Create your business: its name, what you do and your city. Your usual services and prices, your sales stages and a checklist for every event come ready for your trade.",
      "Follow “Get set up” on Home. Each step ticks itself off when you've done it.",
      "Put the app on your home screen. On Android, open the menu in Chrome and tap “Add to Home screen”. On iPhone, tap Share in Safari, then “Add to Home Screen”.",
      `Everything is free to try for ${TRIAL_DAYS} days, no card needed.`,
    ],
  },
  {
    id: "enquiries",
    title: "Enquiries and follow-ups",
    steps: [
      "Add an enquiry from Leads with the client's name, phone, event date and where they found you.",
      "Set when to follow up. Home shows every morning what's due today and what's late.",
      "On an enquiry, note your calls and messages, and send a ready WhatsApp reply in one tap.",
      "Share your enquiry form (More, Enquiry form) in your Instagram bio and on WhatsApp. Enquiries from it land in Leads by themselves.",
      "Move the enquiry through your stages. When it's booked or lost, say so, with the reason, so you learn what wins work.",
    ],
  },
  {
    id: "quotes",
    title: "Quotes",
    steps: [
      "Make a quote from an enquiry or a client. Pick services from your price list; change the quantity or price for this client if you need to.",
      "Share the quote's link on WhatsApp. The client opens it without signing in and accepts with a tap.",
      "When they accept, the enquiry is marked booked and the event is made for you, with the date.",
    ],
  },
  {
    id: "bills",
    title: "Bills, GST and payments",
    steps: [
      "Add your GST number in More, Business profile, to charge GST. Clients in your state get CGST and SGST; clients elsewhere get IGST. Without a GST number, bills don't charge GST.",
      "Make a bill from an event: it starts from the accepted quote. Bills are numbered for the financial year, like INV/26-27/0001.",
      "Add your UPI ID in Business profile. Every bill then carries a QR code, so clients pay in one scan.",
      "Record money when it comes in: UPI, cash, bank, cheque or card. Each gets a receipt number, and the bill shows what's still due.",
      "Money taken before there's a bill is kept as an advance and counted in the event's next bill.",
      "Money, To collect lists everything still due. One tap sends the client a polite reminder on WhatsApp.",
    ],
  },
  {
    id: "clients",
    title: "Clients, reviews and referrals",
    steps: [
      "Give each client their own page: on the client, tap “Make their page” and send it on WhatsApp. It shows their event dates, quotes, bills with Pay by UPI, and what they've paid, always up to date. No sign-in needed.",
      "Stop sharing whenever you like. The old link stops working at once.",
      "Add your Google review link in Business profile. Once an event is over, the event shows “Ask for a review”: one tap sends a polite WhatsApp message with the link.",
      "More, Reviews and referrals lists every finished event you haven't asked about yet, and the clients who send you the most work.",
      "Each client's page has a “recommend us” link. Enquiries from it are marked as their referral by themselves. You can also pick the client when you add an enquiry that came from a referral.",
    ],
  },
  {
    id: "events",
    title: "Events, your team and checklists",
    steps: [
      "An event holds its functions (haldi, mehendi, wedding) with dates, times and venues. The calendar warns you when two events fall on the same day.",
      "Choose who works each event, their role there and when to reach. They see it in their day. Freelancers see only the events they're on.",
      "Add the checklist to an event in one tap: every step gets its date from the functions. Give steps to people, or leave them to anyone on the event.",
      "Mark the days people are away in More, Days off. Choosing an event's team then warns you about anyone who's off.",
    ],
  },
  {
    id: "money",
    title: "Expenses, profit and reports",
    steps: [
      "Add money spent with a photo of the bill: materials, travel, helpers. Staff's expenses wait for the owner or a manager to approve.",
      "Every event shows its profit: what you billed before GST, minus what you spent on it.",
      "Money, Monthly report shows the month's cash, profit, GST, where the work came from and what sold, with spreadsheets for your CA.",
    ],
  },
  {
    id: "team",
    title: "Your team",
    steps: [
      "Invite people by phone from More, Team. They join with one tap on the link you send them on WhatsApp.",
      "Everyone sees their own day on Home: their events this week, when to reach, and what's due.",
      "Scores are worked out each month from the work itself: tasks done on time, follow-ups kept, enquiries booked and expenses added in a day.",
      "Owners and managers see who did what in More, Activity, and can send the day's summary on WhatsApp at closing time.",
    ],
  },
  {
    id: "data",
    title: "Your data",
    steps: [
      "Each business's data is kept apart. Nobody outside your team can see it.",
      "Everything is backed up every night, bill photos included.",
      "Your data is yours: the monthly spreadsheets take your bills, payments and expenses anywhere.",
    ],
  },
];

/** How to use the app, in plain steps. Public, so people can read it before signing up. */
export default function HelpPage() {
  return (
    <div className="min-h-dvh bg-surface">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <h1 className="font-display text-[clamp(32px,6vw,48px)] font-extrabold leading-tight">Help</h1>
        <p className="mt-2 text-lg text-ink-muted">How to use Wedding Yantra, one step at a time.</p>

        <nav aria-label="Topics" className="mt-6 flex flex-wrap gap-2">
          {GUIDES.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="rounded-full bg-cream px-4 py-2 text-sm font-bold text-ink hover:bg-sun-100">
              {g.title}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-8">
          {GUIDES.map((g) => (
            <section key={g.id} id={g.id} className="scroll-mt-6 rounded-3xl border border-line p-6 shadow-soft">
              <h2 className="font-display text-2xl font-extrabold">{g.title}</h2>
              <ol className="mt-4 space-y-3">
                {g.steps.map((step, i) => (
                  <li key={step} className="flex gap-3 leading-relaxed">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cream text-sm font-extrabold text-brand-strong">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}

          <section id="roles" className="scroll-mt-6 rounded-3xl border border-line p-6 shadow-soft">
            <h2 className="font-display text-2xl font-extrabold">Who can do what</h2>
            <dl className="mt-4 divide-y divide-line">
              {ROLES.map((role) => (
                <div key={role} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-4">
                  <dt className="w-32 shrink-0 font-bold">{ROLE_INFO[role].label}</dt>
                  <dd className="text-ink-muted">{ROLE_INFO[role].description}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="mt-12 rounded-3xl bg-cream p-6 text-center">
          <p className="font-display text-xl font-extrabold">Ready when you are</p>
          <Link href="/login" className={buttonClass({ className: "mt-4" })}>
            Start free for {TRIAL_DAYS} days
          </Link>
        </div>
      </main>
    </div>
  );
}
