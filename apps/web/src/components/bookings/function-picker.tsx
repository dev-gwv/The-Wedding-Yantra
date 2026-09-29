"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { DropdownPanel, useDismiss } from "@/components/sales/client-picker";
import { cn } from "@/lib/cn";

/** Functions of an Indian wedding, in the order they usually happen. */
export const FUNCTION_NAMES = [
  "Roka",
  "Sagai / Engagement",
  "Pre-wedding shoot",
  "Haldi",
  "Mehendi",
  "Sangeet",
  "Cocktail",
  "Tilak",
  "Mayra",
  "Wedding",
  "Pheras",
  "Vidaai",
  "Reception",
  "Grih Pravesh",
  "Other",
];

/**
 * Pick the function from a dropdown, or type your own (a birthday, a mayra, a pooja):
 * whatever is typed is kept.
 */
export function FunctionPicker({
  value,
  onChange,
  autoOpen = false,
  ariaLabel,
}: {
  value: string;
  onChange: (name: string) => void;
  autoOpen?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(autoOpen);
  // What's typed since opening narrows the list; opening afresh shows everything.
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useDismiss(box, open, () => setOpen(false));

  useEffect(() => {
    if (autoOpen) input.current?.focus();
  }, [autoOpen]);

  const q = query.trim().toLowerCase();
  const shown = q ? FUNCTION_NAMES.filter((n) => n.toLowerCase().includes(q)) : FUNCTION_NAMES;
  const custom = query.trim() && !FUNCTION_NAMES.some((n) => n.toLowerCase() === q) ? query.trim() : null;
  const options = custom ? [...shown, custom] : shown;

  const pick = (name: string) => {
    onChange(name);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={box} className="relative mt-1">
      <input
        ref={input}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        placeholder="Choose or type a function"
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (options[active]) pick(options[active]);
            else setOpen(false);
          } else if (e.key === "Tab") {
            setOpen(false);
          }
        }}
        className="h-11 w-full rounded-xl border border-line bg-surface pl-3 pr-10 text-[15px] font-semibold text-ink placeholder:font-normal placeholder:text-ink-subtle focus:border-sun-300 focus:shadow-glow focus:outline-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show functions"
        onClick={() => {
          setQuery("");
          setOpen((o) => !o);
          input.current?.focus();
        }}
        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-subtle hover:bg-cream"
      >
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
      </button>
      {open && (
        <DropdownPanel id={listId}>
          {options.map((name, i) => {
            const isCustom = name === custom;
            const selected = !isCustom && name === value;
            return (
              <button
                key={`${isCustom ? "custom-" : ""}${name}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(name)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-ink",
                  i === active ? "bg-cream" : "hover:bg-cream",
                )}
              >
                {isCustom ? (
                  <span className="inline-flex items-center gap-2 text-brand-strong">
                    <Plus className="size-4" /> Use &ldquo;{name}&rdquo;
                  </span>
                ) : (
                  <span>{name}</span>
                )}
                {selected && <Check className="size-4 shrink-0 text-brand-strong" />}
              </button>
            );
          })}
        </DropdownPanel>
      )}
    </div>
  );
}
