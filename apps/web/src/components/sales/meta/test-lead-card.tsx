"use client";

import { useQueryClient } from "@tanstack/react-query";
import { META_TEST_TOOL_URL, metaTestToolSteps } from "@wedding-yantra/core";
import { queryKeys, useApi, useMetaRecent, useSendMetaTestLead } from "@wedding-yantra/api-client/react";
import type { IncomingLeadItem, MetaForm, MetaPage } from "@wedding-yantra/types";
import { CircleAlert, CircleCheck, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { errorKindText } from "./chips";

/** How long to wait for a test lead Wedding Yantra asked Facebook for (seconds). */
const WAIT = 90;
/** How long to keep looking for one sent by hand from Meta's testing tool. */
const WAIT_MANUAL = 300;

interface Watch {
  /** Rows already in the recent list when the test was sent */
  known: string[];
  /** Facebook wouldn't make one for us: the owner sends it from Meta's testing tool */
  manual: boolean;
  toolUrl: string;
}

export interface TestLead {
  start: () => Promise<void>;
  sending: boolean;
  error: string | null;
  watch: Watch | null;
  /** Seconds since it was sent; stops counting once it's in */
  seconds: number;
  /** The test lead, once it has reached Wedding Yantra */
  row: IncomingLeadItem | undefined;
  waiting: boolean;
  /** Wait another 90 seconds */
  again: () => void;
  close: () => void;
}

/**
 * "Send a test lead" for one form: asks Facebook for a test lead, then looks at the recent
 * leads every 2 seconds, for up to 90 seconds, until it shows up.
 */
export function useTestLead(workspaceId: string, page: MetaPage, form: MetaForm): TestLead {
  const api = useApi();
  const qc = useQueryClient();
  const send = useSendMetaTestLead(workspaceId);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watch, setWatch] = useState<Watch | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recent = useMetaRecent(workspaceId, { enabled: !!watch });
  const row = watch
    ? recent.data?.find((r) => r.isTest && !watch.known.includes(r.id) && (r.formName === null || r.formName === form.name))
    : undefined;
  const settled = !!row && row.status !== "queued";
  const waiting = !!watch && !settled && seconds < (watch.manual ? WAIT_MANUAL : WAIT);
  // A second look at the same list, only to ask again every few seconds while waiting.
  useMetaRecent(workspaceId, { enabled: waiting, refetchInterval: waiting ? (watch?.manual ? 5000 : 2000) : false });

  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  // In: the Page's "last lead" and counts change too.
  useEffect(() => {
    if (settled) void qc.invalidateQueries({ queryKey: queryKeys.meta(workspaceId), exact: true });
  }, [settled, qc, workspaceId]);

  async function start() {
    setError(null);
    setWatch(null);
    setFetching(true);
    try {
      // What's in the list now, fresh, so an older test lead isn't taken for this one.
      const before = await qc.fetchQuery({ queryKey: queryKeys.metaRecent(workspaceId), queryFn: () => api.meta.recent(workspaceId), staleTime: 0 });
      const result = await send.mutateAsync({ pageId: page.id, formId: form.formId });
      setSeconds(0);
      setWatch({ known: before.map((r) => r.id), manual: !result.queued, toolUrl: result.toolUrl ?? META_TEST_TOOL_URL });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFetching(false);
    }
  }

  return {
    start,
    sending: fetching || send.isPending,
    error,
    watch,
    seconds,
    row,
    waiting,
    again: () => setSeconds(0),
    close: () => {
      setWatch(null);
      setError(null);
    },
  };
}

/** Where the test lead is: on its way, in (with a link to it), or the steps to send it by hand. */
export function TestLeadPanel({ test, page, form }: { test: TestLead; page: MetaPage; form: MetaForm }) {
  const { watch, row, waiting, seconds, error } = test;
  if (!watch && !error && !test.sending) return null;

  const manualSteps = (
    <>
      <ol className="mt-2 space-y-1.5 text-sm">
        {metaTestToolSteps({ pageName: page.name, formName: form.name }).map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-bold tabular">{i + 1}.</span>
            <span className="min-w-0 break-words">{step}</span>
          </li>
        ))}
      </ol>
      <a
        href={watch?.toolUrl ?? META_TEST_TOOL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass({ variant: "secondary", size: "sm", className: "mt-3" })}
      >
        <ExternalLink className="size-4" /> Open the Testing Tool
      </a>
    </>
  );

  let body;
  if (test.sending) {
    body = (
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Spinner className="size-4 text-brand" /> Asking Facebook for a test lead…
      </p>
    );
  } else if (error) {
    body = (
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex min-w-0 flex-1 items-start gap-2 text-sm font-semibold text-danger">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
        <Button size="sm" variant="secondary" onClick={() => void test.start()}>
          Try again
        </Button>
      </div>
    );
  } else if (row && (row.status === "added" || row.status === "merged")) {
    body = (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-success">
        <CircleCheck className="size-4 shrink-0" />
        <span>
          Test lead received{watch?.manual ? "" : ` in ${seconds} s`}
          {row.status === "merged" && " · added to the open enquiry with the same phone"}
        </span>
        {row.leadId && (
          <>
            <span aria-hidden="true">·</span>
            <Link href={`/app/leads/${row.leadId}`} className="font-bold text-brand-strong underline-offset-2 hover:underline">
              Open it
            </Link>
          </>
        )}
      </p>
    );
  } else if (row && (row.status === "failed" || row.status === "skipped")) {
    body = (
      <p className="flex items-start gap-2 text-sm font-semibold text-danger">
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>
          The test lead reached us but couldn&apos;t be added
          {errorKindText(row.errorKind, true) ? `: ${errorKindText(row.errorKind, true)}` : ""}. Follow the steps shown on the Page, then try again.
        </span>
      </p>
    );
  } else if (row) {
    body = waiting ? (
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Spinner className="size-4 text-brand" /> Test lead is here, adding it to Leads…
      </p>
    ) : (
      <p className="text-sm">The test lead reached us and is still being added. It shows under Recent leads once it&apos;s in.</p>
    );
  } else if (watch?.manual) {
    body = (
      <div>
        <p className="text-sm font-semibold">Facebook didn&apos;t make a test lead for us. Send one yourself in 3 steps:</p>
        {manualSteps}
        <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
          {waiting ? (
            <>
              <Spinner className="size-3.5 text-brand" /> Looking out for it here…
            </>
          ) : (
            "Nothing yet. Once you've sent it, it shows under Recent leads."
          )}
        </p>
      </div>
    );
  } else if (waiting) {
    body = (
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Spinner className="size-4 text-brand" /> Waiting for the test lead… <span className="font-normal text-ink-muted tabular">{seconds} s</span>
      </p>
    );
  } else {
    body = (
      <div>
        <p className="text-sm font-semibold">No test lead after {WAIT} seconds. Facebook can be slow; you can also send one yourself:</p>
        {manualSteps}
        <Button size="sm" variant="ghost" className="mt-1" onClick={test.again}>
          Wait again
        </Button>
      </div>
    );
  }

  return (
    <div className="relative mt-3 rounded-2xl bg-cream p-4 pr-10" role="status">
      {body}
      {!test.sending && (
        <button
          type="button"
          onClick={test.close}
          className="absolute right-2 top-2 rounded-full p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
