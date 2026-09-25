"use client";

import { formatPhone } from "@wedding-yantra/core";
import { useUpdateMe } from "@wedding-yantra/api-client/react";
import { updateMeInput } from "@wedding-yantra/types";
import { useState, type FormEvent } from "react";
import { BackLink } from "@/components/app/back-link";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Card, Notice, PageHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export default function ProfilePage() {
  const { me } = useCurrentWorkspace();
  const update = useUpdateMe();
  const toast = useToast();
  const [name, setName] = useState(me.user.name ?? "");
  const [email, setEmail] = useState(me.user.email ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const check = validate(updateMeInput, { name, email });
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      await update.mutateAsync({ name, email });
      toast("Profile saved");
    } catch (err) {
      const fields = apiFieldErrors(err);
      setErrors(Object.keys(fields).length ? fields : { _: errorMessage(err) });
    }
  }

  return (
    <>
      <BackLink href="/app/more" label="More" />
      <PageHeader title="Your profile" subtitle="The same across every business you work with." />
      <form onSubmit={submit} className="space-y-6" noValidate>
        <Card className="space-y-5 p-5">
          <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            placeholder="Optional"
          />
          <TextField
            label="Mobile number"
            value={formatPhone(me.user.phone)}
            disabled
            hint="You sign in with this number."
          />
        </Card>
        {errors._ && <Notice tone="danger">{errors._}</Notice>}
        <Button type="submit" size="lg" loading={update.isPending} className="sm:w-auto sm:px-8">
          Save
        </Button>
      </form>
    </>
  );
}
