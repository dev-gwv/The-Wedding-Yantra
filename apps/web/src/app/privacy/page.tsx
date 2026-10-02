import type { Metadata } from "next";
import { COMPANY, LegalPage, type LegalSection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Wedding Yantra collects, why, who helps us run the service, and how to export or delete your data.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <>
        <p>
          Wedding Yantra is run by {COMPANY.name}, {COMPANY.address} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy explains what personal data we
          handle when you use the Wedding Yantra website, web app and mobile apps (the &ldquo;service&rdquo;), and the choices you have. It is written
          to meet India&apos;s Digital Personal Data Protection Act, 2023 (the &ldquo;DPDP Act&rdquo;) and the rules made under it.
        </p>
        <p>
          There are two kinds of data here. For <strong>your own account</strong> (your name and number, your business&apos;s plan), we decide how it is
          used. For <strong>the data your business adds</strong> about its clients, enquiries, team and money, your business decides; we only keep and
          process it for you, on your instructions, to run the service.
        </p>
      </>
    ),
  },
  {
    id: "collect",
    title: "What we collect",
    body: (
      <ul>
        <li>
          <strong>Your sign-in details:</strong> your mobile number, which we use to send you a one-time sign-in code, and your name and (if you
          add one) email address. Sign-in codes are stored only as a scrambled hash and expire in minutes.
        </li>
        <li>
          <strong>Your business details:</strong> business name, trade, city, address, phone, email, GSTIN, logo, and the bank account or UPI ID you
          choose to print on invoices.
        </li>
        <li>
          <strong>Your team:</strong> the names, mobile numbers, roles and departments of the people you invite, and any employee details you choose
          to record (for example designation, emergency contact or pay details).
        </li>
        <li>
          <strong>Your clients and work:</strong> what you add about clients and enquiries (names, phone numbers, email, event dates, venues, guest
          counts, notes), and your quotes, invoices, payments, expenses, bill photos, vendors, tasks and events.
        </li>
        <li>
          <strong>Payment status:</strong> which plan you are on and whether it is paid. Card, UPI and bank details you enter to pay us go to our
          payment processor, Razorpay, not to us.
        </li>
        <li>
          <strong>Technical data:</strong> IP address, device and browser type, and server logs, used to keep the service running and secure (for
          example to stop someone requesting thousands of sign-in codes). If you turn on alerts, your browser&apos;s push subscription.
        </li>
      </ul>
    ),
  },
  {
    id: "why",
    title: "Why we use it",
    body: (
      <ul>
        <li>To sign you in and keep your account and your business&apos;s data separate from every other business.</li>
        <li>To provide the features you use: enquiries, quotes, invoices, payments, events, team, reports and alerts.</li>
        <li>To bill your subscription and keep the tax records the law requires.</li>
        <li>To keep the service secure, prevent misuse and fix problems.</li>
        <li>To answer your questions and tell you about important changes to the service.</li>
      </ul>
    ),
  },
  {
    id: "share",
    title: "Who helps us run the service",
    body: (
      <>
        <p>We do not sell personal data. We share it only with service providers who need it to run Wedding Yantra, under contracts that limit what they may do with it:</p>
        <ul>
          <li>
            <strong>Razorpay</strong> (payment processor), to take subscription payments.
          </li>
          <li>
            <strong>[SMS / WhatsApp provider]</strong>, which receives only your mobile number and the sign-in code to deliver it.
          </li>
          <li>
            <strong>[Hosting provider]</strong>, which hosts our servers and database in [Country/region], and <strong>Vercel</strong>, which serves
            the website.
          </li>
        </ul>
        <p>
          We may also disclose data when the law requires it, for example to a court or government authority with a valid order. When your
          business shares a quote, invoice or client page link, whoever has that link can see what is on it.
        </p>
      </>
    ),
  },
  {
    id: "keep",
    title: "How long we keep it",
    body: (
      <>
        <p>
          We keep your data for as long as your account is open. If you close your account, we delete your business&apos;s data within [30] days,
          except what the law requires us to keep (such as our own invoices to you under GST law). Backups are kept for [7] days and then
          overwritten.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <p>
        Data travels over encrypted connections (HTTPS). Every business&apos;s data is kept apart, and each person sees only what their role allows.
        Sign-in codes and session keys are stored only as hashes. We back up the database every night. No system is perfectly secure; if a breach
        affects your data, we will tell you and the Data Protection Board of India as the DPDP Act requires.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights, export and deletion",
    body: (
      <>
        <p>Under the DPDP Act you can:</p>
        <ul>
          <li>ask what personal data we hold about you and how it is used;</li>
          <li>have it corrected, completed or updated;</li>
          <li>have it erased, and withdraw your consent, unless the law requires us to keep it;</li>
          <li>nominate someone to use these rights for you if you die or cannot act yourself;</li>
          <li>have your complaint heard by our grievance officer, and then by the Data Protection Board of India.</li>
        </ul>
        <p>
          <strong>Export:</strong> the owner of a business can download all of its data at any time from <em>Plan and billing</em>, using{" "}
          <em>Download all my data</em>. Monthly spreadsheets are also in <em>Reports</em>.
        </p>
        <p>
          <strong>Delete:</strong> you can change or delete most records in the app yourself. To close your account and delete your business&apos;s
          data, write to {COMPANY.email}. If you are a client of a business that uses Wedding Yantra, please contact that business first; we will
          help them answer you.
        </p>
      </>
    ),
  },
  {
    id: "device",
    title: "Cookies and your device",
    body: (
      <p>
        We do not use advertising or tracking cookies. The app keeps your sign-in key in your browser&apos;s storage so you stay signed in; signing
        out removes it.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Wedding Yantra is for businesses and is not meant for anyone under 18. We do not knowingly collect children&apos;s data for our own use.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>If we change this policy in a way that matters, we will tell you in the app or by message before the change takes effect.</p>,
  },
  {
    id: "contact",
    title: "Grievance officer and contact",
    body: (
      <>
        <p>For any question or complaint about your personal data, contact our grievance officer:</p>
        <p>
          {COMPANY.grievanceName}
          <br />
          {COMPANY.name}, {COMPANY.address}
          <br />
          Email: {COMPANY.grievanceEmail}
        </p>
        <p>We will acknowledge your complaint within [48 hours] and aim to resolve it within [30] days.</p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={<p>What we collect, why we collect it, who helps us run Wedding Yantra, and how you can export or delete your data.</p>}
      sections={SECTIONS}
    />
  );
}
