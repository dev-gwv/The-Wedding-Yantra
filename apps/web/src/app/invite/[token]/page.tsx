"use client";

import { ROLE_INFO } from "@wedding-yantra/core";
import { useAcceptInvitation, useInvitationPreview } from "@wedding-yantra/api-client/react";
import { MailX } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/app/logo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, EmptyState, Notice } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/errors";
import { clearSession, setWorkspaceId, useToken } from "@/lib/session";

/** Opened from the link shared on WhatsApp. */
export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const session = useToken();
  const preview = useInvitationPreview(token);
  const accept = useAcceptInvitation();
  const [error, setError] = useState<string | null>(null);

  if (preview.isPending || session === undefined) return <Splash />;

  const here = `/invite/${token}`;

  async function join() {
    setError(null);
    try {
      const { workspaceId } = await accept.mutateAsync(token);
      setWorkspaceId(workspaceId);
      router.replace("/app");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const invite = preview.data;
  const unavailable =
    preview.isError
      ? "This invitation link is not valid."
      : invite?.status === "accepted"
        ? "This invitation was already used."
        : invite?.status === "expired"
          ? "This invitation has expired. Ask for a new link."
          : invite?.status === "revoked"
            ? "This invitation was cancelled."
            : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 pb-10 pt-12 sm:pt-20">
      <Logo />

      {unavailable || !invite ? (
        <EmptyState icon={MailX} title="Can't use this invite" className="mt-10">
          {unavailable ?? "This invitation link is not valid."}
        </EmptyState>
      ) : (
        <div className="mt-12 space-y-6">
          <div>
            <p className="text-sm font-medium text-brand">You&apos;re invited</p>
            <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">Join {invite.workspaceName}</h1>
            <p className="mt-3 text-ink-muted">
              {invite.invitedByName ?? "The owner"} has added you to the team on Wedding Yantra.
            </p>
          </div>

          <Card className="divide-y divide-line">
            <Row label="Business" value={`${invite.workspaceName} · ${invite.businessTypeName}`} />
            <Row label="Your role" value={ROLE_INFO[invite.role].label} hint={ROLE_INFO[invite.role].description} />
            <Row label="Mobile number" value={invite.phoneMasked} />
          </Card>

          {error && <Notice tone="danger">{error}</Notice>}

          {session ? (
            <div className="space-y-3">
              <Button size="lg" onClick={join} loading={accept.isPending}>
                Join {invite.workspaceName}
              </Button>
              {error && (
                <Button
                  size="lg"
                  variant="ghost"
                  onClick={() => {
                    clearSession();
                    router.replace(`/login?next=${encodeURIComponent(here)}`);
                  }}
                >
                  Sign in with a different number
                </Button>
              )}
            </div>
          ) : (
            <ButtonLink size="lg" href={`/login?next=${encodeURIComponent(here)}`}>
              Continue with {invite.phoneMasked}
            </ButtonLink>
          )}
        </div>
      )}
    </main>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
