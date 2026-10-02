"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { amountInWords, formatINR } from "@/lib/money";
import { Field } from "./field";

/** Keep digits and one dot, at most two digits after it. */
function clean(raw: string): string {
  const [whole = "", ...rest] = raw.replace(/[^\d.]/g, "").split(".");
  const intPart = whole.replace(/^0+(?=\d)/, "");
  return rest.length ? `${intPart}.${rest.join("").slice(0, 2)}` : intPart;
}

/** `150000.5` -> `1,50,000.5`, keeping a dot or zeros still being typed. */
function group(text: string): string {
  if (!text) return "";
  const [whole, decimals] = text.split(".");
  const head = whole ? formatINR(Number(whole)) : "0";
  return decimals === undefined ? head : `${head}.${decimals}`;
}

const parse = (text: string): number | null => (text === "" || text === "." ? null : Number(text));

type MoneyInputProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "children"> & {
  label: string;
  /** The amount in rupees; null when empty */
  value: number | null;
  /** Gets the amount as a number, or null when the box is emptied */
  onChange: (value: number | null) => void;
  /** Shown under the box; the amount in words ("1.5 lakh") is shown with it */
  hint?: ReactNode;
  error?: string;
  /** Hide the "1.5 lakh" line */
  noWords?: boolean;
};

/**
 * A ₹ amount box that groups the digits as people write them (1,50,000) and says the amount
 * in words under it (1.5 lakh), so an extra zero is easy to catch.
 *
 *   <MoneyInput label="Amount" value={amount} onChange={setAmount} error={errors.amount} />
 */
export function MoneyInput({ label, value, onChange, hint, error, noWords, className, ...input }: MoneyInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // What's typed, so "1." and "1.50" survive; the value from outside wins when it differs.
  const [text, setText] = useState(() => (value === null ? "" : clean(String(value))));
  const shown = parse(text) === value ? text : value === null ? "" : clean(String(value));
  const display = group(shown);
  // Where the caret goes after the commas move: after the same number of digits.
  const caret = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const digits = caret.current;
    if (!el || digits === null || document.activeElement !== el) return;
    caret.current = null;
    let pos = 0;
    let seen = 0;
    while (pos < display.length && seen < digits) {
      if (/[\d.]/.test(display[pos]!)) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }, [display]);

  const words = !noWords && value !== null ? amountInWords(value) : "";
  const note = words && hint ? (
    <>
      {words} · {hint}
    </>
  ) : (
    words || hint
  );

  return (
    <Field label={label} hint={note || undefined} error={error} className={className}>
      {(props) => (
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-base text-ink-muted" aria-hidden="true">
            ₹
          </span>
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            {...input}
            {...props}
            value={display}
            onChange={(e) => {
              const raw = e.target.value;
              const at = e.target.selectionStart ?? raw.length;
              caret.current = raw.slice(0, at).replace(/[^\d.]/g, "").length;
              const next = clean(raw);
              setText(next);
              onChange(parse(next));
            }}
            className={cn(props.className, "pl-9 tabular")}
          />
        </div>
      )}
    </Field>
  );
}
