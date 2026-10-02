"use client";

import { firstName } from "@wedding-yantra/core";
import { useSaveEmployeeDetails } from "@wedding-yantra/api-client/react";
import {
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  employeeDetailsInput,
  PAY_TYPE_LABELS,
  PAY_TYPES,
  type Employee,
  type EmploymentType,
  type PayType,
} from "@wedding-yantra/types";
import { Lock } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { OptionSelect } from "@/components/app/option-picker";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { PhoneField, SelectField, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { apiFieldErrors, errorMessage, validate } from "@/lib/errors";

export function EmployeeFormSheet({ employee, open, onClose, onSaved }: { employee: Employee; open: boolean; onClose: () => void; onSaved: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`${employee.name ?? "Team member"}: details`}>
      {open && <EmployeeForm employee={employee} onSaved={onSaved} />}
    </Sheet>
  );
}

const local = (phone: string | null | undefined) => (phone?.startsWith("+91") ? phone.slice(3) : (phone ?? ""));

function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-line p-4">
      <legend className="px-1 font-bold">{title}</legend>
      {note}
      {children}
    </fieldset>
  );
}

function EmployeeForm({ employee: e, onSaved }: { employee: Employee; onSaved: () => void }) {
  const { workspace } = useCurrentWorkspace();
  const save = useSaveEmployeeDetails(workspace.id, e.id);
  const pay = e.pay;
  const [designation, setDesignation] = useState<string | null>(e.designation);
  const [department, setDepartment] = useState<string | null>(e.department);
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">(e.employmentType ?? "");
  const [payType, setPayType] = useState<PayType | "">(pay?.payType ?? "");
  const [v, setV] = useState({
    joinedOn: e.joinedOn ?? "",
    emergencyName: e.emergency?.name ?? "",
    emergencyPhone: local(e.emergency?.phone),
    payAmount: pay?.payAmount != null ? String(pay.payAmount) : "",
    upiId: pay?.upiId ?? "",
    bankAccount: pay?.bankAccount ?? "",
    ifsc: pay?.ifsc ?? "",
    pan: pay?.pan ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (key: keyof typeof v) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [key]: ev.target.value }));
  const who = e.isYou ? "you" : firstName(e.name ?? "them");

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const payload = {
      ...v,
      designation,
      department,
      employmentType: employmentType || null,
      payType: payType || null,
      payAmount: v.payAmount === "" ? null : Number(v.payAmount),
    };
    const check = validate(employeeDetailsInput, payload);
    if (check.errors) return setErrors(check.errors);
    setErrors({});
    try {
      await save.mutateAsync(payload);
      onSaved();
    } catch (err) {
      const fieldErrors = apiFieldErrors(err);
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { _: errorMessage(err) });
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Group title="Work">
        <OptionSelect list="designation" label="Designation" value={designation} onChange={setDesignation} error={errors.designation} />
        <OptionSelect list="department" label="Department" value={department} onChange={setDepartment} error={errors.department} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Type" value={employmentType} onChange={(ev) => setEmploymentType(ev.target.value as EmploymentType | "")} error={errors.employmentType}>
            <option value="">Not set</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EMPLOYMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <TextField label="Joining date" type="date" value={v.joinedOn} onChange={set("joinedOn")} error={errors.joinedOn} />
        </div>
      </Group>

      <Group title="Emergency contact" note={<p className="text-sm text-ink-muted">Who to call if something happens to {who} at work.</p>}>
        <TextField label="Name" value={v.emergencyName} onChange={set("emergencyName")} error={errors.emergencyName} placeholder="Father, wife, brother…" />
        <PhoneField label="Mobile" value={v.emergencyPhone} onChange={set("emergencyPhone")} error={errors.emergencyPhone} />
      </Group>

      <Group
        title="Pay and bank"
        note={
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Lock className="size-4 shrink-0" /> Only you{e.isYou ? "" : ` and ${who}`} see this.
          </p>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Paid" value={payType} onChange={(ev) => setPayType(ev.target.value as PayType | "")} error={errors.payType}>
            <option value="">Not set</option>
            {PAY_TYPES.map((t) => (
              <option key={t} value={t}>
                {PAY_TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <TextField
            label={payType === "daily" ? "Amount a day (₹)" : "Amount a month (₹)"}
            inputMode="numeric"
            value={v.payAmount}
            onChange={(ev) => setV((x) => ({ ...x, payAmount: ev.target.value.replace(/\D/g, "") }))}
            error={errors.payAmount}
          />
        </div>
        <TextField label="UPI ID" value={v.upiId} onChange={set("upiId")} error={errors.upiId} placeholder="name@okaxis" autoCapitalize="none" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Bank account" inputMode="numeric" value={v.bankAccount} onChange={set("bankAccount")} error={errors.bankAccount} />
          <TextField label="IFSC" value={v.ifsc} onChange={set("ifsc")} error={errors.ifsc} placeholder="SBIN0001234" autoCapitalize="characters" />
        </div>
        <TextField label="PAN" value={v.pan} onChange={set("pan")} error={errors.pan} placeholder="ABCDE1234F" autoCapitalize="characters" hint="For TDS on professional fees" />
      </Group>

      {errors._ && <Notice tone="danger">{errors._}</Notice>}
      {Object.keys(errors).length > 0 && !errors._ && <Notice tone="danger">Please check the highlighted fields.</Notice>}
      <Button type="submit" size="lg" loading={save.isPending}>
        Save
      </Button>
    </form>
  );
}
