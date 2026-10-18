"use client";

import { formatPhone, whatsappLink } from "@wedding-yantra/core";
import { useUpdateLeadForm } from "@wedding-yantra/api-client/react";
import { FORM_FIELD_LABELS, FORM_FIELDS, type AfterSubmit, type FormField, type FormFieldKey, type LeadFormSettings } from "@wedding-yantra/types";
import { CircleCheck, ExternalLink, Link2, ListChecks, MessageCircle, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, TextAreaField, TextField } from "@/components/ui/field";
import { Card, Notice } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { apiFieldErrors, errorMessage } from "@/lib/errors";

const local = (phone: string | null | undefined) => (phone?.startsWith("+91") ? phone.slice(3) : (phone ?? ""));

/** Which questions the form asks, besides name and mobile, and which must be answered. */
export function FormQuestionsCard({ form }: { form: LeadFormSettings }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateLeadForm(workspace.id);
  const toast = useToast();
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const asked = new Map(fields.map((f) => [f.key, f]));
  const changed = JSON.stringify(fields) !== JSON.stringify(form.fields);

  // Kept in the form's own order, whatever order they were switched on in.
  const toggle = (key: FormFieldKey, on: boolean) =>
    setFields((list) => (on ? FORM_FIELDS.filter((k) => k === key || list.some((f) => f.key === k)).map((k) => list.find((f) => f.key === k) ?? { key: k }) : list.filter((f) => f.key !== key)));
  const setRequired = (key: FormFieldKey, required: boolean) => setFields((list) => list.map((f) => (f.key === key ? { key, ...(required ? { required } : {}) } : f)));

  function save() {
    update.mutate(
      { fields },
      {
        onSuccess: () => toast("Questions saved. The form asks these now."),
        onError: (err) => toast(errorMessage(err), "error"),
      },
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
        <ListChecks className="size-5 text-brand-strong" /> Questions on your form
      </h2>
      <p className="mt-1 text-sm text-ink-muted">Keep it short: fewer questions, more enquiries. Name and mobile are always asked.</p>
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line">
        {(["Name", "Mobile number"] as const).map((l) => (
          <li key={l} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-semibold">{l}</span>
            <span className="text-xs font-bold text-ink-muted">Always asked</span>
          </li>
        ))}
        {FORM_FIELDS.map((key) => {
          const f = asked.get(key);
          return (
            <li key={key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className={cn("block font-semibold", !f && "text-ink-muted")}>{FORM_FIELD_LABELS[key]}</span>
                {key === "services" && (
                  <span className="block text-xs text-ink-muted">
                    The choices are your{" "}
                    <Link href="/app/settings/lists" className="font-bold text-brand-strong underline">
                      service categories
                    </Link>
                    .
                  </span>
                )}
              </span>
              {f && (
                <label className="flex items-center gap-2 text-xs font-bold text-ink-muted">
                  <input type="checkbox" checked={!!f.required} onChange={(e) => setRequired(key, e.target.checked)} className="size-4 accent-brand" />
                  Must answer
                </label>
              )}
              <Switch checked={!!f} label={`Ask "${FORM_FIELD_LABELS[key]}"`} onChange={(on) => toggle(key, on)} />
            </li>
          );
        })}
      </ul>
      {changed && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button loading={update.isPending} onClick={save}>
            Save questions
          </Button>
          <Button variant="ghost" onClick={() => setFields(form.fields)}>
            Undo
          </Button>
        </div>
      )}
    </Card>
  );
}

const CHOICES: { value: AfterSubmit; title: string; about: string; icon: typeof MessageCircle }[] = [
  { value: "whatsapp", title: "Chat with you on WhatsApp", about: "WhatsApp opens with their enquiry typed in. One tap sends it to you.", icon: MessageCircle },
  { value: "thanks", title: "Just say thank you", about: "A thank-you message, and you call them back.", icon: CircleCheck },
  { value: "link", title: "Open a link", about: "Your WhatsApp Business short link, a WhatsApp group, Instagram or your website.", icon: Link2 },
];

/** Where people go the moment they send the form: by default, a WhatsApp chat with the business. */
export function AfterSendingCard({ form }: { form: LeadFormSettings }) {
  const { workspace } = useCurrentWorkspace();
  const update = useUpdateLeadForm(workspace.id);
  const toast = useToast();
  const [mode, setMode] = useState<AfterSubmit>(form.afterSubmit);
  const [phone, setPhone] = useState(local(form.whatsappPhone));
  const [text, setText] = useState(form.whatsappText ?? "");
  const [url, setUrl] = useState(form.redirectUrl ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const changed = mode !== form.afterSubmit || phone !== local(form.whatsappPhone) || text !== (form.whatsappText ?? "") || url !== (form.redirectUrl ?? "");

  const greeting = text.trim() || `Hi ${workspace.name}! I just sent you an enquiry.`;
  const sample = `${greeting}\n\nName: Priya Sharma\nEvent: Wedding, 14 Feb 2027`;
  const chatPhone = phone ? `+91${phone.replace(/\D/g, "")}` : form.defaultWhatsappPhone;

  function save() {
    setErrors({});
    update.mutate(
      { afterSubmit: mode, whatsappPhone: phone, whatsappText: text, redirectUrl: url },
      {
        onSuccess: () => toast(mode === "whatsapp" ? "Saved. After sending the form, people land in a WhatsApp chat with you." : "Saved"),
        onError: (err) => {
          const fields = apiFieldErrors(err);
          if (Object.keys(fields).length) setErrors(fields);
          else toast(errorMessage(err), "error");
        },
      },
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
        <Send className="size-5 text-brand-strong" /> After they send the form
      </h2>
      <div className="mt-4 grid gap-2" role="radiogroup" aria-label="After they send the form">
        {CHOICES.map(({ value, title, about, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "flex items-start gap-3 rounded-2xl border p-4 text-left transition",
              mode === value ? "border-brand bg-cream shadow-soft" : "border-line hover:border-sun-300",
            )}
          >
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", mode === value ? "border-brand" : "border-line-strong")}>
              {mode === value && <span className="size-2.5 rounded-full bg-brand" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-bold">
                <Icon className="size-4 text-brand-strong" /> {title}
                {value === "whatsapp" && <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">Best</span>}
              </span>
              <span className="block text-sm text-ink-muted">{about}</span>
            </span>
          </button>
        ))}
      </div>

      {mode === "whatsapp" && (
        <div className="mt-5 space-y-4">
          <PhoneField
            label="Your WhatsApp number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.whatsappPhone}
            placeholder={form.defaultWhatsappPhone ? local(form.defaultWhatsappPhone) : "98765 43210"}
            hint={
              phone
                ? "Chats open with this number."
                : form.defaultWhatsappPhone
                  ? `Leave it empty to use ${formatPhone(form.defaultWhatsappPhone)}.`
                  : "The number you chat with clients on."
            }
          />
          <TextAreaField
            label="Their first message (optional)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={errors.whatsappText}
            maxLength={300}
            placeholder={`Hi ${workspace.name}! I just sent you an enquiry.`}
            hint="Their name and event are added under it, so you know who it is."
          />
          <div>
            <p className="text-sm font-semibold text-ink-muted">What they&apos;ll send you</p>
            <div className="mt-2 rounded-2xl bg-[#e7f8e1] p-4 text-[15px] whitespace-pre-line text-[#112b1a] dark:bg-[#1f3b2a] dark:text-[#e3f7e9]">{sample}</div>
          </div>
          {chatPhone && (
            <a href={whatsappLink(sample, chatPhone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-strong">
              <ExternalLink className="size-4" /> Try it: wa.me/{chatPhone.replace(/\D/g, "")}
            </a>
          )}
        </div>
      )}

      {mode === "link" && (
        <div className="mt-5 space-y-4">
          <TextField
            label="The link to open"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            error={errors.redirectUrl}
            placeholder="https://wa.me/message/…"
            hint="Starts with https://"
          />
          <ShortLinkGuide />
        </div>
      )}

      {mode === "thanks" && <p className="mt-4 text-sm text-ink-muted">They see &ldquo;Thank you! {workspace.name} has your details and will get in touch with you soon.&rdquo;</p>}

      {changed && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button loading={update.isPending} onClick={save}>
            Save
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setMode(form.afterSubmit);
              setPhone(local(form.whatsappPhone));
              setText(form.whatsappText ?? "");
              setUrl(form.redirectUrl ?? "");
              setErrors({});
            }}
          >
            Undo
          </Button>
        </div>
      )}
      {!form.enabled && (
        <div className="mt-4">
          <Notice tone="warning">The form is switched off, so nobody can send it right now.</Notice>
        </div>
      )}
    </Card>
  );
}

/** Where WhatsApp Business keeps the short link: Tools, then Short link. Drawn, not a screenshot. */
function ShortLinkGuide() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-cream p-4 sm:flex-row sm:items-center">
      <div aria-hidden className="mx-auto w-44 shrink-0 rounded-[22px] border-4 border-ink/80 bg-[#f4f4f4] p-2 text-[10px] text-[#111]">
        <p className="py-1 text-center text-[11px] font-bold">Tools</p>
        <p className="mt-1 px-1 text-[9px] font-bold">Manage your account</p>
        <div className="mt-1 rounded-xl bg-white">
          {["Profile", "Facebook and Instagram"].map((x) => (
            <p key={x} className="border-b border-[#eee] px-2 py-1.5">
              {x}
            </p>
          ))}
          <p className="relative rounded-lg px-2 py-1.5 font-bold ring-2 ring-brand">
            Short link
            <span className="block text-[8px] font-normal text-[#666]">Invite to chat via link or QR code</span>
            <span className="absolute -right-1 -top-2 rounded-full bg-brand px-1.5 text-[8px] font-bold text-white">Tap</span>
          </p>
        </div>
        <div className="mt-2 flex justify-around rounded-full bg-white py-1 text-[8px]">
          <span>Chats</span>
          <span className="rounded-full bg-[#e8e8e8] px-1.5 font-bold">Tools</span>
          <span>Settings</span>
        </div>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Open the WhatsApp Business app.</li>
        <li>
          Tap <b>Tools</b> at the bottom.
        </li>
        <li>
          Tap <b>Short link</b>, then copy the link.
        </li>
        <li>Paste it in the box above and tap Save.</li>
      </ol>
    </div>
  );
}
