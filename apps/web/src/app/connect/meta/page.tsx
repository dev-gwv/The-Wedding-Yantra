"use client";

import { ApiRequestError } from "@wedding-yantra/api-client";
import { useMetaComplete } from "@wedding-yantra/api-client/react";
import { CircleAlert, LogIn, Megaphone, ShieldAlert, UserRoundX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { AuthScreen } from "@/components/app/auth-screen";
import {
  clearReturn,
  dropStaleReturn,
  parseReturn,
  readReturnRaw,
  saveReturn,
  stateWorkspace,
  subscribeReturn,
} from "@/components/sales/meta/return-stash";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Spinner, Splash } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { getWorkspaceId, setWorkspaceId, useToken, useWorkspaceId } from "@/lib/session";

const HERE = "/connect/meta";
const SETTINGS = "/app/settings/facebook-leads";

interface Trouble {
  icon: LucideIcon;
  title: string;
  text: string;
  /** Worth asking again: the server didn't answer, so nothing was decided */
  retry?: boolean;
}

/**
 * Worth sending the same login again: no answer reached us, or the first try is still talking
 * to Facebook. Once the server has used the login, its answer is final (a repeat gets the same
 * one), so the owner starts again with Continue with Facebook instead.
 */
function worthRetrying(err: unknown): boolean {
  if (!(err instanceof ApiRequestError)) return true;
  if (err.status === 0 || err.code === "BAD_RESPONSE" || err.code === "META_BUSY") return true;
  return err.status >= 500 && !err.code.startsWith("META_");
}

/** What went wrong, in the owner's words, from the server's answer. */
function troubleFor(err: unknown): Trouble {
  const code = err instanceof ApiRequestError ? err.code : "";
  switch (code) {
    case "META_STATE_INVALID":
      return {
        icon: CircleAlert,
        title: "This Facebook login has expired",
        text: "It was too old or already used. Go back and tap Continue with Facebook again.",
      };
    case "META_WRONG_PERSON":
      return {
        icon: UserRoundX,
        title: "Someone else started this",
        text: "This Facebook login was started by someone else on Wedding Yantra. Sign in with your own number and tap Continue with Facebook again.",
      };
    case "META_NO_PAGES":
      return {
        icon: Megaphone,
        title: "No Pages were shared",
        text: "Facebook didn't share any Page with us. Tap Continue with Facebook again and tick the Page your lead ads run from. If it isn't listed, ask whoever has full control of the Page to connect it.",
      };
    case "META_PERMISSIONS_MISSING":
      return {
        icon: ShieldAlert,
        title: "Some permissions were switched off",
        text: "Wedding Yantra needs every permission Facebook asks about to bring in your leads. Tap Continue with Facebook again and keep every option switched on.",
      };
  }
  if (err instanceof ApiRequestError && err.status === 403) {
    return { icon: ShieldAlert, title: "Only the owner connects Facebook", text: err.message };
  }
  return { icon: CircleAlert, title: "Couldn't finish connecting", text: errorMessage(err), retry: worthRetrying(err) };
}

function Working({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center py-8 text-center" role="status">
      <Spinner className="size-7 text-brand" />
      <p className="mt-4 font-display text-xl font-extrabold">{text}</p>
      <p className="mt-1 text-sm text-ink-muted">This takes a few seconds.</p>
    </div>
  );
}

function Problem({ trouble, onRetry }: { trouble: Trouble; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={trouble.icon}
      title={trouble.title}
      className="py-6"
      action={
        <div className="flex flex-col items-center gap-2">
          {trouble.retry && onRetry && (
            <Button onClick={onRetry}>
              Try again
            </Button>
          )}
          <ButtonLink href={SETTINGS} variant={trouble.retry && onRetry ? "ghost" : "primary"}>
            Back to settings
          </ButtonLink>
        </div>
      }
    >
      {trouble.text}
    </EmptyState>
  );
}

/**
 * Where Facebook sends the owner back after "Continue with Facebook". Outside /app, so a
 * sign-in in between doesn't lose what Facebook sent.
 */
function ConnectMeta() {
  const params = useSearchParams();
  const router = useRouter();
  const token = useToken();
  const savedWorkspace = useWorkspaceId();
  const raw = useSyncExternalStore(subscribeReturn, readReturnRaw, () => undefined);
  const back = parseReturn(raw);
  const fromFacebook = params.has("code") || params.has("state") || params.has("error");
  // Which business to ask; the server checks it really is the one the login started from.
  const workspaceId = stateWorkspace(back?.state ?? null) ?? savedWorkspace ?? "";
  const complete = useMetaComplete(workspaceId);
  const { mutate } = complete;
  const started = useRef(false);

  // First, always: keep what Facebook sent, then take it out of the address bar and history.
  useEffect(() => {
    if (fromFacebook) {
      saveReturn({ code: params.get("code"), state: params.get("state"), error: params.get("error"), at: Date.now() });
      // `null`, so the router sees the change and reads the address again.
      window.history.replaceState(null, "", HERE);
    } else {
      dropStaleReturn();
    }
  }, [fromFacebook, params]);

  const finish = useCallback(
    (code: string, state: string) =>
      mutate(
        { code, state },
        {
          onSuccess: (result) => {
            clearReturn();
            if (getWorkspaceId() !== workspaceId) setWorkspaceId(workspaceId);
            router.replace(`${SETTINGS}?connected=1${result.needsChoice ? "&choose=1" : ""}`);
          },
          onError: (err) => {
            // Signed out on the way: keep it to finish after signing in. Unanswered: keep it to try again.
            const keep = (err instanceof ApiRequestError && err.status === 401) || worthRetrying(err);
            if (!keep) clearReturn();
          },
        },
      ),
    [mutate, workspaceId, router],
  );

  const code = back?.code ?? null;
  const state = back?.state ?? null;
  const cancelled = !!back?.error;
  useEffect(() => {
    if (fromFacebook || token === undefined || !code || !state || cancelled) return;
    if (token === null) {
      router.replace(`/login?next=${encodeURIComponent(HERE)}`);
      return;
    }
    if (started.current || !workspaceId) return;
    started.current = true;
    finish(code, state);
  }, [fromFacebook, token, code, state, cancelled, workspaceId, router, finish]);

  let body;
  if (complete.isSuccess) {
    body = <Working text="Connected. Opening your Pages…" />;
  } else if (complete.isError) {
    body = (
      <Problem
        trouble={troubleFor(complete.error)}
        onRetry={code && state ? () => finish(code, state) : undefined}
      />
    );
  } else if (fromFacebook || token === undefined || raw === undefined) {
    body = <Working text="Connecting Facebook…" />;
  } else if (!back) {
    body = (
      <Problem
        trouble={{ icon: Megaphone, title: "Nothing to finish here", text: "To connect Facebook, open Settings, then Facebook & Instagram leads." }}
      />
    );
  } else if (back.error) {
    body = (
      <Problem
        trouble={
          back.error === "access_denied"
            ? { icon: LogIn, title: "You cancelled on Facebook", text: "Nothing was connected. You can try again whenever you're ready." }
            : { icon: CircleAlert, title: "Facebook didn't finish", text: "Nothing was connected. Please try again." }
        }
      />
    );
  } else if (!back.code || !back.state) {
    body = <Problem trouble={{ icon: CircleAlert, title: "Facebook didn't finish", text: "Nothing was connected. Please try again." }} />;
  } else if (token && !workspaceId) {
    body = (
      <Problem
        trouble={{ icon: CircleAlert, title: "Couldn't tell which business", text: "Open Settings, then Facebook & Instagram leads, and tap Continue with Facebook again." }}
      />
    );
  } else {
    body = <Working text="Connecting Facebook…" />;
  }

  return <AuthScreen>{body}</AuthScreen>;
}

export default function ConnectMetaPage() {
  return (
    <Suspense fallback={<Splash />}>
      <ConnectMeta />
    </Suspense>
  );
}
