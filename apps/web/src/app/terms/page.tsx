import { TRIAL_DAYS } from "@wedding-yantra/core";
import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY, LegalPage, type LegalSection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Wedding Yantra: your subscription, acceptable use, your data, our liability and governing law.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    body: (
      <p>
        These terms are an agreement between {COMPANY.name}, {COMPANY.address} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) and the business that signs up for
        Wedding Yantra (&ldquo;you&rdquo;). By creating an account or using the service you accept them on behalf of your business, and you confirm
        you are at least 18 and allowed to do so.
      </p>
    ),
  },
  {
    id: "service",
    title: "The service and your account",
    body: (
      <>
        <p>
          Wedding Yantra is software for wedding businesses to manage enquiries, quotes, invoices, payments, events and their team. We may improve
          and change features over time; we will not remove a core feature you pay for without telling you first.
        </p>
        <p>
          You sign in with your mobile number. Keep your phone and sign-in codes to yourself; you are responsible for what happens under your
          account and for the people you invite to your business.
        </p>
      </>
    ),
  },
  {
    id: "subscription",
    title: "Free trial and subscription",
    body: (
      <ul>
        <li>New businesses get a free trial of {TRIAL_DAYS} days. No card is needed.</li>
        <li>
          After the trial, you choose a paid plan, monthly or yearly. Prices are in Indian rupees and shown on our website; GST is added where it
          applies.
        </li>
        <li>
          Plans renew automatically at the end of each period and are charged through our payment processor, Razorpay, until you cancel.
        </li>
        <li>We will give you at least [30] days&apos; notice before changing the price of your plan.</li>
        <li>
          If a payment fails or a trial ends unpaid, you can still see your data, but adding new work may be paused until you pay. Refunds and
          cancellations are covered by our{" "}
          <Link href="/refunds" className="font-semibold text-brand-strong underline underline-offset-2">
            Refund and cancellation policy
          </Link>
          .
        </li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use the service for anything unlawful, fraudulent or misleading;</li>
          <li>send messages to people who have not agreed to hear from you, or use the service to spam;</li>
          <li>add personal data you have no right to hold, or use clients&apos; data for purposes they did not agree to;</li>
          <li>try to get into another business&apos;s data, test or break our security, or overload the service;</li>
          <li>copy, resell or reverse-engineer the service, except where the law allows it.</li>
        </ul>
        <p>We may suspend accounts that break these rules, and will tell you why unless the law prevents it.</p>
      </>
    ),
  },
  {
    id: "data",
    title: "Your data is yours",
    body: (
      <>
        <p>
          You own everything your business adds to Wedding Yantra. You give us permission to store and process it only to run the service for
          you, as described in our{" "}
          <Link href="/privacy" className="font-semibold text-brand-strong underline underline-offset-2">
            Privacy Policy
          </Link>
          . We do not sell it or use it to advertise to your clients.
        </p>
        <p>
          For your clients&apos; and team&apos;s personal data you are the &ldquo;Data Fiduciary&rdquo; under the DPDP Act and we process it on your
          behalf. You are responsible for having a lawful reason to collect it and for answering their requests, and we will help you do so.
        </p>
        <p>
          You can download all your data at any time (Plan and billing, Download all my data). If you close your account, we keep your data for
          [30] days so you can change your mind or export it, and then delete it.
        </p>
      </>
    ),
  },
  {
    id: "ours",
    title: "What we are responsible for",
    body: (
      <>
        <p>
          We work to keep Wedding Yantra available, secure and backed up, but we cannot promise it will never be interrupted or free of errors.
          Planned maintenance will be at quiet hours where we can manage it.
        </p>
        <p>
          The service helps you work out GST, invoices and reports, but you remain responsible for your own tax filings and business decisions.
          Please check figures with your CA.
        </p>
        <p>
          Some features rely on other services (Razorpay for payments, WhatsApp and SMS providers for messages). Their own terms apply to them,
          and we are not responsible for their outages.
        </p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Limits of liability",
    body: (
      <>
        <p>
          To the extent the law allows, we are not liable for indirect or consequential losses, such as lost profits, lost bookings or lost
          goodwill. Our total liability for any claim relating to the service is limited to the fees you paid us in the 12 months before the
          claim.
        </p>
        <p>Nothing in these terms limits liability that cannot be limited under Indian law.</p>
        <p>You agree to cover our losses if a claim is made against us because of data you added or your breach of these terms.</p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Ending the agreement",
    body: (
      <p>
        You can stop using Wedding Yantra and cancel your plan at any time. We may end the agreement with [30] days&apos; notice, or straight away
        if you seriously break these terms. Either way, you can export your data first.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: <p>If we change these terms in a way that matters, we will tell you in the app at least [15] days before the change takes effect.</p>,
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These terms are governed by the laws of India. We will first try to resolve any dispute by talking to you. If we cannot, the courts at{" "}
        {COMPANY.city}, India have exclusive jurisdiction.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        {COMPANY.name}, {COMPANY.address}. Email: {COMPANY.email}. Grievance officer: {COMPANY.grievanceName}, {COMPANY.grievanceEmail}.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={<p>The rules for using Wedding Yantra, in plain words: your subscription, what you may do with it, and who owns your data.</p>}
      sections={SECTIONS}
    />
  );
}
