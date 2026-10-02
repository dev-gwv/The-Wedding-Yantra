"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /**
   * The form inside has changes not yet saved. While true, closing it (X, Esc, a tap
   * outside, the phone's back button) first asks "Discard changes?".
   */
  dirty?: boolean;
  /** Called when the person chooses Discard, just before `onClose`: e.g. forget a saved draft. */
  onDiscard?: () => void;
}

/**
 * A panel that slides up from the bottom on phones and sits in the middle on larger
 * screens. Built on the native <dialog>, so focus, Esc and screen readers just work.
 */
export function Sheet({ open, onClose, title, description, children, className, dirty = false, onDiscard }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);
  // Read in the dialog's events, which can come after the props have changed.
  const latest = useRef({ open, dirty });
  useEffect(() => {
    latest.current = { open, dirty };
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (asking) keepRef.current?.focus();
  }, [asking]);

  // Nothing left to lose: the question goes away by itself.
  const showAsk = asking && open && dirty;

  // A reload or closing the tab loses the changes too.
  useEffect(() => {
    if (!open || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, dirty]);

  function requestClose() {
    if (dirty) setAsking(true);
    else onClose();
  }

  function discard() {
    setAsking(false);
    onDiscard?.();
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={() => {
        // The phone's back button can close the dialog even when Esc is held back: open it
        // again and ask, unless the page closed it on purpose.
        if (latest.current.open && latest.current.dirty) {
          ref.current?.showModal();
          setAsking(true);
          return;
        }
        setAsking(false);
        onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (showAsk) setAsking(false);
        else requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
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
              onClick={requestClose}
              className="-mr-2 -mt-1 rounded-full p-2 text-ink-muted hover:bg-cream hover:text-ink"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="px-6 pb-6 pt-4">{children}</div>
          {showAsk && (
            <div
              role="alertdialog"
              aria-labelledby="sheet-discard"
              className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-line bg-surface px-6 py-4 shadow-warm"
            >
              <p id="sheet-discard" className="min-w-0 flex-1 text-[15px] font-bold">
                Discard changes?
              </p>
              <button
                ref={keepRef}
                type="button"
                onClick={() => setAsking(false)}
                className="inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-bold hover:bg-cream"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={discard}
                className="inline-flex h-10 items-center rounded-xl bg-danger px-4 text-sm font-bold text-on-brand hover:opacity-90"
              >
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

/** One line at the top of a form that came back from a saved draft. */
export function DraftRestored({ onClear }: { onClear: () => void }) {
  return (
    <p className="-mt-1 flex items-center gap-1.5 text-sm text-ink-muted" role="status">
      Draft restored ·
      <button type="button" onClick={onClear} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
        Clear
      </button>
    </p>
  );
}
