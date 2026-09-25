"use client";

import { useQueryClient } from "@tanstack/react-query";
import { formatPhone } from "@wedding-yantra/core";
import { queryKeys, useApi, useRequestOtp, useUpdateMe, useVerifyOtp } from "@wedding-yantra/api-client/react";
import { otpRequestInput, otpVerifyInput, updateMeInput } from "@wedding-yantra/types";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { AuthScreen } from "@/components/app/auth-screen";
import { Button } from "@/components/ui/button";
import { PhoneField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";
import { getToken, setToken } from "@/lib/session";

type Step = "phone" | "code" | "name";

/** Only follow `next` to pages inside this app. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

function LoginFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const api = useApi();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [normalized, setNormalized] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [channel, setChannel] = useState<"whatsapp" | "sms" | "none" | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resendIn, setResendIn] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const requestOtp = useRequestOtp();
  const verifyOtp = useVerifyOtp();
  const updateMe = useUpdateMe();

  useEffect(() => {
    if (getToken()) router.replace(next ?? "/app");
  }, [router, next]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  async function goToApp() {
    setFinishing(true);
    const me = await queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: api.auth.me });
    if (next) router.replace(next);
    else router.replace(me.workspaces.length > 0 ? "/app" : "/onboarding");
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const check = validate(otpRequestInput, { phone });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const result = await requestOtp.mutateAsync({ phone });
      setNormalized(result.phone);
      setDevCode(result.devCode);
      setChannel(result.channel);
      setCode("");
      setStep("code");
      setResendIn(30);
    } catch (err) {
      setErrors({ phone: apiFieldErrors(err).phone ?? errorMessage(err) });
    }
  }

  async function checkCode(e: FormEvent) {
    e.preventDefault();
    const check = validate(otpVerifyInput, { phone: normalized, code });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      const session = await verifyOtp.mutateAsync({ phone: normalized, code });
      setToken(session.token);
      // Invitees skip the name step: accepting the invite fills in the name the owner typed.
      if (session.isNewUser && !next?.startsWith("/invite/")) setStep("name");
      else await goToApp();
    } catch (err) {
      setErrors({ code: apiFieldErrors(err).code ?? errorMessage(err) });
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const check = validate(updateMeInput, { name });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      await updateMe.mutateAsync({ name });
      await goToApp();
    } catch (err) {
      setErrors({ name: apiFieldErrors(err).name ?? errorMessage(err) });
    }
  }

  return (
    <AuthScreen>

      {step === "phone" && (
        <form onSubmit={sendCode} className="space-y-6" noValidate>
          <div>
            <h1 className="font-display text-3xl font-extrabold">Welcome</h1>
            <p className="mt-1 text-[15px] text-ink-muted">
              Run your wedding business from <span className="font-bold text-gradient">one place</span>. Sign in
              with your mobile number.
            </p>
          </div>
          <PhoneField
            label="Mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
            autoFocus
          />
          <Button type="submit" size="lg" loading={requestOtp.isPending}>
            Get code
          </Button>
          <p className="text-center text-sm text-ink-muted">New here? The same step creates your account.</p>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={checkCode} className="space-y-6" noValidate>
          <button
            type="button"
            onClick={() => setStep("phone")}
            className="-ml-1 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Change number
          </button>
          <div>
            <h1 className="font-display text-3xl font-extrabold">Enter the code</h1>
            <p className="mt-1 text-[15px] text-ink-muted">
              We sent a 6-digit code {channel === "whatsapp" ? "on WhatsApp " : channel === "sms" ? "by SMS " : ""}to{" "}
              <span className="font-medium text-ink tabular">{formatPhone(normalized)}</span>
            </p>
          </div>
          {devCode && (
            <Notice tone="warning">
              Test mode: messages are not being sent yet. Your code is{" "}
              <span className="font-semibold tabular">{devCode}</span>
            </Notice>
          )}
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            error={errors.code}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em] [&_input]:tabular"
            maxLength={6}
            autoFocus
          />
          <Button type="submit" size="lg" loading={verifyOtp.isPending || finishing}>
            Verify
          </Button>
          <p className="text-center text-sm text-ink-muted">
            {resendIn > 0 ? (
              <>Didn&apos;t get it? You can ask again in {resendIn}s</>
            ) : (
              <button type="button" onClick={() => void sendCode()} className="font-bold text-brand-strong hover:text-brand-deep">
                Send a new code
              </button>
            )}
          </p>
        </form>
      )}

      {step === "name" && (
        <form onSubmit={saveName} className="space-y-6" noValidate>
          <div>
            <h1 className="font-display text-3xl font-extrabold">What&apos;s your name?</h1>
            <p className="mt-1 text-[15px] text-ink-muted">Your team and clients will see this name.</p>
          </div>
          <TextField
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            autoComplete="name"
            placeholder="Riya Sharma"
            autoFocus
          />
          <Button type="submit" size="lg" loading={updateMe.isPending || finishing}>
            Continue
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Splash />}>
      <LoginFlow />
    </Suspense>
  );
}
