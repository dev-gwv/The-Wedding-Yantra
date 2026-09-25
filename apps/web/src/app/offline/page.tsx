import { WifiOff } from "lucide-react";
import { AuthScreen } from "@/components/app/auth-screen";
import { EmptyState } from "@/components/ui/misc";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <AuthScreen>
      <EmptyState icon={WifiOff} title="You're offline" className="py-6">
        Wedding Yantra needs the internet to show your latest data. It will work again as soon as you&apos;re
        back online.
      </EmptyState>
    </AuthScreen>
  );
}
