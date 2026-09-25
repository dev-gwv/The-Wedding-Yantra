import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Events" };

export default function EventsPage() {
  return (
    <ComingSoon title="Events" icon={CalendarDays} heading="Your events calendar">
      Every booking with its functions, venue, team and checklist, and a warning when two events clash.
    </ComingSoon>
  );
}
