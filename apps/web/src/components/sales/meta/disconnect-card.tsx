"use client";

import { useDisconnectMeta } from "@wedding-yantra/api-client/react";
import { Unplug } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

/** Stops every Page's leads and forgets the Facebook login. Leads already here stay. */
export function DisconnectCard({ workspaceId }: { workspaceId: string }) {
  const disconnect = useDisconnectMeta(workspaceId);
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await disconnect.mutateAsync();
      setAsking(false);
      toast("Facebook disconnected");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:flex-1">
        <p className="font-bold">Disconnect Facebook</p>
        <p className="text-sm text-ink-muted">Leads stop coming in from every Page. Leads already here stay.</p>
      </div>
      <Button variant="danger" className="-ml-2 sm:ml-0" onClick={() => setAsking(true)}>
        <Unplug className="size-4" /> Disconnect
      </Button>
      <Sheet open={asking} onClose={() => setAsking(false)} title="Disconnect Facebook?">
        <p className="text-[15px] text-ink-muted">
          New leads from your Facebook and Instagram forms stop coming in at once. Leads already in Wedding Yantra stay, with their answers. You can
          connect again any time.
        </p>
        {error && (
          <div className="mt-4">
            <Notice tone="danger">{error}</Notice>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="destructive" loading={disconnect.isPending} onClick={() => void confirm()}>
            Disconnect
          </Button>
          <Button variant="secondary" disabled={disconnect.isPending} onClick={() => setAsking(false)}>
            Keep it
          </Button>
        </div>
      </Sheet>
    </Card>
  );
}
