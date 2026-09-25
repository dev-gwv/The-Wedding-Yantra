"use client";

import { usePublicForm, useSubmitPublicForm } from "@wedding-yantra/api-client/react";
import { EVENT_LABELS, EVENT_TYPES, submitLeadFormInput, type EventType } from "@wedding-yantra/types";
import { CircleCheck, MailX } from "lucide-react";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BusinessIcon } from "@/components/app/business-icon";
import { LogoMark } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { EmptyState, Notice } from "@/components/ui/misc";
import { Splash } from "@/components/ui/spinner";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

/** The page a business shares on Instagram or WhatsApp, or prints as a QR code. */
export default function PublicEnquiryPage() {
  const { slug } = useParams<{ slug: string }>();
  const form = usePublicForm(slug);
  const submit = useSubmitPublicForm(slug);
  const [values, setValues] = useState({ name: "", phone: "", eventType: "", eventDate: "", city: "", message: "", website: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));

  if (form.isPending) return <Splash />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = { ...values, eventType: (values.eventType || null) as EventType | null };
    const check = validate(submitLeadFormInput, payload);
    if (check.errors) return setErrors(check.errors);
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
            <span className="grid size-14 place-items-center rounded-2xl bg-gradient-primary text-on-brand shadow-soft">
              <BusinessIcon name={business.businessTypeIcon} className="size-7" />
            </span>
            <h1 className="mt-4 font-display text-3xl font-extrabold">{business.businessName}</h1>
            <p className="mt-1 text-ink-muted">
              {business.businessTypeName} · {business.city}
            </p>
          </div>
        )}

        <div className="rounded-3xl border border-line bg-surface p-6 shadow-soft sm:p-8">
          {!business ? (
            <EmptyState icon={MailX} title="This form isn't available" className="py-6">
              The link may be old or switched off. Please contact the business directly.
            </EmptyState>
          ) : submit.isSuccess ? (
            <EmptyState icon={CircleCheck} title="Thank you!" className="py-6">
              {business.businessName} has your details and will get in touch with you soon.
            </EmptyState>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <div>
                <h2 className="font-display text-2xl font-extrabold">Tell us about your event</h2>
                <p className="mt-1 text-[15px] text-ink-muted">We usually reply the same day.</p>
              </div>
              <TextField label="Your name" value={values.name} onChange={set("name")} error={errors.name} autoComplete="name" />
              <PhoneField label="Mobile number" value={values.phone} onChange={set("phone")} error={errors.phone} hint="We'll reach you on WhatsApp or a call." />
              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Event" value={values.eventType} onChange={set("eventType")} error={errors.eventType}>
                  <option value="">Choose</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVENT_LABELS[t]}
                    </option>
                  ))}
                </SelectField>
                <TextField label="Date" type="date" value={values.eventDate} onChange={set("eventDate")} error={errors.eventDate} />
              </div>
              <TextField label="City" value={values.city} onChange={set("city")} error={errors.city} autoComplete="address-level2" />
              <TextAreaField label="Anything else?" value={values.message} onChange={set("message")} error={errors.message} placeholder="Venue, number of people, what you're looking for" />
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
