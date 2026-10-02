import { TRIAL_DAYS } from "@wedding-yantra/core";
import type { Metadata } from "next";
import { COMPANY, LegalPage, type LegalSection } from "@/components/site/legal-page";

export const metadata: Metadata = {
  title: "Refunds and cancellations",
  description: "How cancelling a Wedding Yantra plan works, and when you get money back.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "trial",
    title: "Free trial",
    body: (
      <p>
        Every new business can use Wedding Yantra free for {TRIAL_DAYS} days, with no card needed. Nothing is charged during the trial, so there
        is nothing to refund or cancel. If you do not choose a plan, your data stays safe and visible.
      </p>
    ),
  },
  {
    id: "cancel",
    title: "Cancelling your plan",
    body: (
      <>
        <p>
          You can cancel at any time by writing to {COMPANY.email} from your registered number or email, with your Business ID (shown on{" "}
          <em>Plan and billing</em>). [Or: from the subscription link Razorpay sends you.]
        </p>
        <p>
          Your plan stays active until the end of the period you have paid for and does not renew after that. Your data is kept, and you can
          download all of it at any time.
        </p>
      </>
    ),
  },
  {
    id: "monthly",
    title: "Monthly plans",
    body: <p>Monthly payments are not refunded for part of a month. When you cancel, you keep using your plan until the month you paid for ends.</p>,
  },
  {
    id: "yearly",
    title: "Yearly plans",
    body: (
      <>
        <p>
          If you cancel within [7] days of your first yearly payment, we refund it in full. After that, yearly payments are not refunded for the
          unused months, and your plan stays active until the year you paid for ends.
        </p>
        <p>[To decide before launch: whether to offer a pro-rata refund of whole unused months instead.]</p>
      </>
    ),
  },
  {
    id: "mistakes",
    title: "Charged by mistake",
    body: (
      <p>
        If you were charged twice, charged after cancelling, or charged the wrong amount, tell us within [30] days and we refund the extra amount
        in full.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changing plans",
    body: (
      <p>
        Moving to a bigger plan starts the new plan&apos;s price from your next payment [or: straight away, with the difference charged pro rata].
        Moving to a smaller plan takes effect from your next renewal; the current period is not refunded.
      </p>
    ),
  },
  {
    id: "how",
    title: "How refunds are paid",
    body: (
      <>
        <p>
          To ask for a refund, write to {COMPANY.email} with your Business ID and the Razorpay payment ID from your receipt. We reply within [2]
          working days.
        </p>
        <p>
          Approved refunds go back to the card, UPI or bank account you paid from, through Razorpay, within [5 to 7] working days. Your bank may
          take a few more days to show it.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        {COMPANY.name}, {COMPANY.address}. Email: {COMPANY.email}. If you are not happy with how we handled your request, contact our grievance
        officer, {COMPANY.grievanceName}, at {COMPANY.grievanceEmail}.
      </p>
    ),
  },
];

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refunds and cancellations"
      intro={<p>How cancelling works, and when you get your money back.</p>}
      sections={SECTIONS}
    />
  );
}
