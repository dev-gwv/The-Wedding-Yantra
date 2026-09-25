"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/**
 * A panel that slides up from the bottom on phones and sits in the middle on larger
 * screens. Built on the native <dialog>, so focus, Esc and screen readers just work.
 */
export function Sheet({ open, onClose, title, description, children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="sheet-title"
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-surface p-0 text-ink shadow-warm",
        "sm:m-auto sm:max-w-md sm:rounded-3xl",
        className,
      )}
    >
      {open && (
        <div className="pb-safe">
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4 px-6 pt-4 sm:pt-6">
            <div>
              <h2 id="sheet-title" className="font-display text-xl font-extrabold">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 -mt-1 rounded-full p-2 text-ink-muted hover:bg-cream hover:text-ink"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="px-6 pb-6 pt-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}
