"use client";

import { ROLE_INFO } from "@wedding-yantra/core";
import { useAcceptInvitation, useInvitationPreview } from "@wedding-yantra/api-client/react";
import { MailX } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { AuthScreen } from "@/components/app/auth-screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, Eyebrow, Notice } from "@/components/ui/misc";
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
    <AuthScreen>

      {unavailable || !invite ? (
        <EmptyState icon={MailX} title="Can't use this invite" className="py-6">
          {unavailable ?? "This invitation link is not valid."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div>
            <Eyebrow>You&apos;re invited</Eyebrow>
            <h1 className="mt-3 font-display text-3xl font-extrabold">Join {invite.workspaceName}</h1>
            <p className="mt-1 text-[15px] text-ink-muted">
              {invite.invitedByName ?? "The owner"} has added you to the team on Wedding Yantra.
            </p>
          </div>

          <div className="divide-y divide-line rounded-2xl border border-line">
            <Row label="Business" value={`${invite.workspaceName} · ${invite.businessTypeName}`} />
            <Row label="Your role" value={ROLE_INFO[invite.role].label} hint={ROLE_INFO[invite.role].description} />
            <Row label="Mobile number" value={invite.phoneMasked} />
          </div>

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
    </AuthScreen>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
