"use client";

import { ApiRequestError } from "@wedding-yantra/api-client";
import { formatDate, localISODate } from "@wedding-yantra/core";
import { useMetaDeletionStatus } from "@wedding-yantra/api-client/react";
import { CircleCheck, CloudOff, Hourglass, SearchX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";

/** A timestamp as the visitor's own calendar date: "11 Oct 2026". */
const day = (iso: string) => formatDate(localISODate(new Date(iso)));

function Code({ code }: { code: string }) {
  return (
    <p className="mt-4 rounded-xl bg-cream px-4 py-3 text-sm">
      Confirmation code: <span className="break-all font-bold tabular">{code}</span>
    </p>
  );
}

/** Where a "delete my data" request sent from Facebook stands. Public: opened from Facebook. */
export function DeletionStatus() {
  const code = (useSearchParams().get("code") ?? "").trim();
  const status = useMetaDeletionStatus(code);

  if (!code) {
    return (
      <EmptyState icon={SearchX} title="No request code" className="py-6">
        Open this page from the link Facebook gave you. It has a code at the end.
      </EmptyState>
    );
  }
  if (status.isPending) {
    return (
      <div className="flex justify-center py-10 text-brand" role="status" aria-label="Loading">
        <Spinner className="size-7" />
      </div>
    );
  }
  if (status.isError) {
    const missing = status.error instanceof ApiRequestError && status.error.status === 404;
    return (
      <EmptyState
        icon={missing ? SearchX : CloudOff}
        title={missing ? "We couldn't find this request" : "Can't check right now"}
        className="py-6"
        action={missing ? undefined : <Button onClick={() => void status.refetch()}>Try again</Button>}
      >
        {missing
          ? "Check that the link is complete. If it still doesn't work, write to us with the confirmation code."
          : "Please check your internet and try again."}
      </EmptyState>
    );
  }

  const done = status.data.status === "done";
  return (
    <div>
      <EmptyState icon={done ? CircleCheck : Hourglass} title={done ? "Your data has been deleted" : "We're deleting your data"} className="py-6">
        {done
          ? `Done on ${day(status.data.completedAt ?? status.data.requestedAt)}. Wedding Yantra no longer has your Facebook login or the access it gave to your Pages.`
          : `We got your request on ${day(status.data.requestedAt)}. Your Facebook login and the access it gave to your Pages are being removed.`}
      </EmptyState>
      <Code code={code} />
      <div className="mt-4 space-y-2 text-sm text-ink-muted">
        <p>
          Leads a business already received from its own ads stay with that business, as its own records. To have those removed, please ask the
          business.
        </p>
        <p>
          More in our{" "}
          <Link href="/privacy#meta-leads" className="font-semibold text-brand-strong underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
