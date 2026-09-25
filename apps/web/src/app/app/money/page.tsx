import { IndianRupee } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

export const metadata = { title: "Money" };

export default function MoneyPage() {
  return (
    <ComingSoon title="Money" icon={IndianRupee} heading="Bills, payments and profit">
      Quotes, GST bills, payments received, expenses, and the profit on every event.
    </ComingSoon>
  );
}
