import { Inbox } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <ComingSoon title="Leads" icon={Inbox} heading="Every enquiry in one place">
      Capture enquiries from Instagram, WhatsApp and referrals, move them from first call to booked, and never
      miss a follow-up.
    </ComingSoon>
  );
}
