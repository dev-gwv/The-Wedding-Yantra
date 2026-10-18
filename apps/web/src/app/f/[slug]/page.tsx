"use client";

import { usePublicForm, useSubmitPublicForm } from "@wedding-yantra/api-client/react";
import { EVENT_LABELS, EVENT_TYPES, submitLeadFormInput, type EventType, type FormFieldKey } from "@wedding-yantra/types";
import { Check, CircleCheck, ExternalLink, Handshake, Heart, MailX, MessageCircle } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { BusinessMark } from "@/components/app/business-mark";
import { LogoMark } from "@/components/app/logo";
import { Button, buttonClass } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

/** The page a business shares on Instagram or WhatsApp, or prints as a QR code. */
export default function PublicEnquiryPage() {
  return (
    <Suspense fallback={<Splash />}>
      <PublicEnquiry />
    </Suspense>
  );
}

function PublicEnquiry() {
  const { slug } = useParams<{ slug: string }>();
  // Opened from a client's "recommend us" link: the enquiry is credited to them.
  const params = useSearchParams();
  const ref = params.get("ref")?.trim().slice(0, 40) || undefined;
  // Scanned from a partner's QR code: the enquiry is credited to that partner.
  const partnerCode = params.get("p")?.trim().slice(0, 20) || undefined;
  const form = usePublicForm(slug, ref, partnerCode);
  const submit = useSubmitPublicForm(slug);
  const [values, setValues] = useState({ name: "", phone: "", email: "", eventType: "", eventDate: "", city: "", guests: "", budget: "", message: "", website: "" });
  const [services, setServices] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  // Sent: on to WhatsApp (or the business's link) after a moment to read the thank-you.
  const redirectUrl = submit.data?.redirectUrl ?? null;
  useEffect(() => {
    if (!redirectUrl) return;
    const timer = setTimeout(() => window.location.assign(redirectUrl), 1500);
    return () => clearTimeout(timer);
  }, [redirectUrl]);

  if (form.isPending) return <Splash />;

  const asked = new Map((form.data?.fields ?? []).map((f) => [f.key, f]));
  const has = (key: FormFieldKey) => asked.has(key);
  const label = (key: FormFieldKey, text: string) => (asked.get(key)?.required ? text : `${text} (optional)`);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const count = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d]/g, "")));
    const payload = {
      ...values,
      eventType: (values.eventType || null) as EventType | null,
      guests: count(values.guests),
      budget: count(values.budget),
      ...(has("services") && { services }),
      ...(ref && { ref }),
      ...(partnerCode && { p: partnerCode }),
    };
    const check = validate(submitLeadFormInput, payload);
    const missing: Record<string, string> = {};
    const names: Record<FormFieldKey, keyof typeof payload> = {
      email: "email",
      event_type: "eventType",
      event_date: "eventDate",
      city: "city",
      services: "services",
      guests: "guests",
      budget: "budget",
      message: "message",
    };
    for (const f of form.data?.fields ?? []) {
      const v = payload[names[f.key]];
      if (f.required && (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)))
        missing[names[f.key]] = f.key === "services" ? "Tick at least one" : "Please fill this in";
    }
    if (check.errors || Object.keys(missing).length) return setErrors({ ...missing, ...check.errors });
    setErrors({});
    try {
      await submit.mutateAsync(payload);
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  const business = form.data;

  return (
    <div className="min-h-dvh bg-hero">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 sm:px-5">
        {business && (
          <div className="mb-8 flex flex-col items-center text-center">
            <BusinessMark logoUrl={business.logoUrl} icon={business.businessTypeIcon} name={business.businessName} size="lg" />
            <h1 className="mt-4 font-display text-3xl font-extrabold">{business.businessName}</h1>
            <p className="mt-1 text-ink-muted">
              {business.businessTypeName} · {business.city}
            </p>
            {business.referrer && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface/80 px-4 py-1.5 text-sm font-semibold text-brand-strong ring-1 ring-sun-300/60">
                <Heart className="size-4" /> Recommended by {business.referrer}
              </p>
            )}
            {business.partner && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-surface/80 px-4 py-1.5 text-sm font-semibold text-brand-strong ring-1 ring-sun-300/60">
                <Handshake className="size-4" /> Sent via {business.partner}
              </p>
            )}
          </div>
        )}

        <div className="rounded-3xl border border-line bg-surface p-6 shadow-soft sm:p-8">
          {!business ? (
            <EmptyState icon={MailX} title="This form isn't available" className="py-6">
              The link may be old or switched off. Please contact the business directly.
            </EmptyState>
          ) : submit.isSuccess ? (
            <EmptyState icon={CircleCheck} title="Thank you!" className="py-6">
              {redirectUrl ? (
                <>
                  <span className="block">
                    {business.goesTo === "link" ? `Taking you to ${business.businessName}…` : `Opening WhatsApp, so you can chat with ${business.businessName} right away…`}
                  </span>
                  <a href={redirectUrl} className={cn(buttonClass({ size: "lg" }), "mt-5")}>
                    {business.goesTo === "link" ? <ExternalLink className="size-5" /> : <MessageCircle className="size-5" />}
                    {business.goesTo === "link" ? "Continue" : "Chat on WhatsApp"}
                  </a>
                </>
              ) : (
                `${business.businessName} has your details and will get in touch with you soon.`
              )}
            </EmptyState>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <div>
                <h2 className="font-display text-2xl font-extrabold">Tell us about your event</h2>
                <p className="mt-1 text-[15px] text-ink-muted">We usually reply the same day.</p>
              </div>
              <TextField label="Your name" value={values.name} onChange={set("name")} error={errors.name} autoComplete="name" />
              <PhoneField label="Mobile number" value={values.phone} onChange={set("phone")} error={errors.phone} hint="We'll reach you on WhatsApp or a call." />
              {has("email") && (
                <TextField label={label("email", "Email")} type="email" value={values.email} onChange={set("email")} error={errors.email} autoComplete="email" inputMode="email" />
              )}
              {(has("event_type") || has("event_date")) && (
                <div className={cn("grid gap-3", has("event_type") && has("event_date") && "grid-cols-2")}>
                  {has("event_type") && (
                    <SelectField label={label("event_type", "Event")} value={values.eventType} onChange={set("eventType")} error={errors.eventType}>
                      <option value="">Choose</option>
                      {EVENT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {EVENT_LABELS[t]}
                        </option>
                      ))}
                    </SelectField>
                  )}
                  {has("event_date") && <TextField label={label("event_date", "Date")} type="date" value={values.eventDate} onChange={set("eventDate")} error={errors.eventDate} />}
                </div>
              )}
              {has("city") && <TextField label={label("city", "City")} value={values.city} onChange={set("city")} error={errors.city} autoComplete="address-level2" />}
              {has("services") && business.services.length > 0 && (
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">{label("services", "What do you need?")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {business.services.map((x) => {
                      const on = services.includes(x);
                      return (
                        <button
                          key={x}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setServices((list) => (on ? list.filter((y) => y !== x) : [...list, x]))}
                          className={cn(
                            "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition",
                            on ? "border-brand bg-brand text-on-brand" : "border-line bg-surface hover:border-sun-300",
                          )}
                        >
                          {on && <Check className="size-4" />} {x}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-ink-muted">Tick all that apply.</p>
                  {errors.services && <p className="mt-1 text-sm font-semibold text-danger">{errors.services}</p>}
                </fieldset>
              )}
              {(has("guests") || has("budget")) && (
                <div className={cn("grid gap-3", has("guests") && has("budget") && "grid-cols-2")}>
                  {has("guests") && <TextField label={label("guests", "Guests")} inputMode="numeric" value={values.guests} onChange={set("guests")} error={errors.guests} placeholder="300" />}
                  {has("budget") && <TextField label={label("budget", "Budget (₹)")} inputMode="numeric" value={values.budget} onChange={set("budget")} error={errors.budget} placeholder="5,00,000" />}
                </div>
              )}
              {has("message") && (
                <TextAreaField
                  label={label("message", "Anything else?")}
                  value={values.message}
                  onChange={set("message")}
                  error={errors.message}
                  placeholder="Venue, number of people, what you're looking for"
                />
              )}
              {/* Hidden from people. Bots fill it in, and their enquiries are ignored. */}
              <input type="text" name="website" value={values.website} onChange={set("website")} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
              {errors._ && <Notice tone="danger">{errors._}</Notice>}
              <Button type="submit" size="lg" loading={submit.isPending}>
                Send enquiry
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-muted">
          <LogoMark className="size-5" /> Powered by Wedding Yantra
        </p>
      </main>
    </div>
  );
}
