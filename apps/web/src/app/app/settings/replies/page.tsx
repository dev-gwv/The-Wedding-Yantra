"use client";

import { can, renderTemplate, TEMPLATE_PLACEHOLDERS } from "@wedding-yantra/core";
import { useCreateTemplate, useDeleteTemplate, useTemplates, useUpdateTemplate } from "@wedding-yantra/api-client/react";
import { templateInput, type WhatsAppTemplate } from "@wedding-yantra/types";
import { MessageCircle, Plus } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export default function RepliesPage() {
  const { me, workspace } = useCurrentWorkspace();
  const templates = useTemplates(workspace.id);
  const editable = can(workspace.role, "workspace.update");
  const [editing, setEditing] = useState<WhatsAppTemplate | "new" | null>(null);
  const sample = { name: "Neha Kapoor", business: workspace.name, eventDate: "2026-12-05", myName: me.user.name };

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader
        title="WhatsApp replies"
        subtitle="Ready-made messages you send from a lead in one tap."
        action={
          editable && (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" strokeWidth={2.5} /> New reply
            </Button>
          )
        }
      />
      {templates.isPending && (
        <div className="flex justify-center py-16 text-brand">
          <Spinner />
        </div>
      )}
      {templates.isError && <Notice tone="danger">{errorMessage(templates.error)}</Notice>}
      {templates.data?.length === 0 && (
        <Card>
          <EmptyState icon={MessageCircle} title="No quick replies yet">
            Save the messages you type again and again: thank you, packages, availability, follow-ups.
          </EmptyState>
        </Card>
      )}
      <div className="grid gap-3">
        {templates.data?.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => editable && setEditing(t)}
            disabled={!editable}
            className="rounded-3xl border border-line bg-surface p-5 text-left shadow-soft transition enabled:hover:border-sun-300"
          >
            <p className="font-display text-base font-extrabold">{t.title}</p>
            <p className="mt-2 whitespace-pre-line text-[15px] text-ink-muted">{renderTemplate(t.body, sample)}</p>
          </button>
        ))}
      </div>
      {templates.data && templates.data.length > 0 && (
        <p className="mt-4 text-sm text-ink-muted">Shown here with an example client, Neha Kapoor.</p>
      )}
      <ReplySheet template={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function ReplySheet({ template, onClose }: { template: WhatsAppTemplate | "new" | null; onClose: () => void }) {
  const isNew = template === "new";
  return (
    <Sheet open={template !== null} onClose={onClose} title={isNew ? "New reply" : "Edit reply"}>
      {template !== null && <ReplyForm template={isNew ? undefined : template} onDone={onClose} />}
    </Sheet>
  );
}

function ReplyForm({ template, onDone }: { template?: WhatsAppTemplate; onDone: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const create = useCreateTemplate(workspace.id);
  const update = useUpdateTemplate(workspace.id);
  const remove = useDeleteTemplate(workspace.id);
  const toast = useToast();
  const [title, setTitle] = useState(template?.title ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  function insert(token: string) {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody((b) => b.slice(0, start) + token + b.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(templateInput, { title, body });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      if (template) await update.mutateAsync({ id: template.id, title, body });
      else await create.mutateAsync({ title, body });
      toast("Reply saved");
      onDone();
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  async function del() {
    if (!template) return;
    try {
      await remove.mutateAsync(template.id);
      toast("Reply deleted");
      onDone();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="Share our packages" />
      <TextAreaField
        ref={bodyRef}
        label="Message"
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={errors.body}
        hint="Tap a chip to add their details. They fill in by themselves."
      />
      <div className="flex flex-wrap gap-2">
        {TEMPLATE_PLACEHOLDERS.map((p) => (
          <button key={p.token} type="button" onClick={() => insert(p.token)} className="rounded-full bg-cream px-3 py-1.5 text-xs font-semibold hover:bg-sun-100">
            + {p.label}
          </button>
        ))}
      </div>
      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      <Button type="submit" size="lg" loading={create.isPending || update.isPending}>
        Save reply
      </Button>
      {template && (
        <Button variant="danger" size="lg" onClick={del} loading={remove.isPending}>
          Delete reply
        </Button>
      )}
    </form>
  );
}
