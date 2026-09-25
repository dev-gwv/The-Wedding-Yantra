import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const INPUT =
  "h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink placeholder:text-ink-subtle " +
  "transition-all focus:border-sun-300 focus:shadow-glow focus:outline-none " +
  "disabled:bg-cream disabled:text-ink-muted";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string; className: string }) => ReactNode;
  className?: string;
}

/** A label, the input, and one line under it: the hint, or the error in red. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children({
        id,
        className: cn(INPUT, error && "border-danger focus:border-danger"),
        ...(error ? { "aria-invalid": true } : {}),
        ...(error || hint ? { "aria-describedby": noteId } : {}),
      })}
      {(error || hint) && (
        <p id={noteId} className={cn("text-sm", error ? "text-danger" : "text-ink-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...input
}: Omit<ComponentProps<"input">, "children"> & { label: string; hint?: ReactNode; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(props) => <input {...input} {...props} />}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  ...input
}: Omit<ComponentProps<"textarea">, "children"> & { label: string; hint?: ReactNode; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(props) => <textarea rows={3} {...input} {...props} className={cn(props.className, "h-auto py-3")} />}
    </Field>
  );
}

/** Indian mobile number with a fixed +91 in front. */
export function PhoneField({
  label,
  hint,
  error,
  className,
  ...input
}: Omit<ComponentProps<"input">, "children" | "type"> & { label: string; hint?: ReactNode; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(props) => (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base text-ink-muted">
            +91
          </span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="98765 43210"
            {...input}
            {...props}
            className={cn(props.className, "pl-14 tabular")}
          />
        </div>
      )}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...select
}: ComponentProps<"select"> & { label: string; hint?: ReactNode; error?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(props) => (
        <select {...select} {...props} className={cn(props.className, "appearance-none bg-surface pr-10")}>
          {children}
        </select>
      )}
    </Field>
  );
}
