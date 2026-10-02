"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

const PREFIX = "wy.draft.";

function read<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as { v: T }).v : undefined;
  } catch {
    // Blocked storage or a broken draft: start fresh.
    return undefined;
  }
}

/** Forget a saved draft, e.g. when the person chooses "Discard" on a sheet. */
export function discardDraft(key: string | null) {
  if (!key) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing saved, nothing to forget.
  }
}

/**
 * Form state that survives a closed sheet, a reload or a phone call: like useState, but kept
 * in this browser under `key` while it differs from `initial`.
 *
 *   const [form, setForm, clearDraft, restored] = useDraft(`expense.${workspace.id}`, empty);
 *
 * - Pass `null` as the key to turn drafts off (e.g. when changing something already saved).
 * - `restored` is true when the form opened with a saved draft; show "Draft restored · Clear".
 * - Call `clearDraft()` after saving; it also puts the form back to `initial`.
 *
 * It reads the draft when the component first renders, so use it in parts that mount in the
 * browser, such as the body of a sheet.
 */
export function useDraft<T>(key: string | null, initial: T): [T, Dispatch<SetStateAction<T>>, () => void, boolean] {
  // The first `initial` is the empty form; later renders may build a new one each time.
  const [start] = useState(() => {
    const saved = key && typeof window !== "undefined" ? read<T>(key) : undefined;
    return { empty: initial, saved };
  });
  const [value, setValue] = useState<T>(() => (start.saved !== undefined ? start.saved : start.empty));
  const [restored, setRestored] = useState(start.saved !== undefined);
  const emptyJson = useRef(JSON.stringify(start.empty));

  useEffect(() => {
    if (!key) return;
    try {
      const json = JSON.stringify(value);
      if (json === emptyJson.current) window.localStorage.removeItem(PREFIX + key);
      else window.localStorage.setItem(PREFIX + key, JSON.stringify({ v: value, at: Date.now() }));
    } catch {
      // Full or blocked storage: the form still works, it just isn't kept.
    }
  }, [key, value]);

  const clear = useCallback(() => {
    discardDraft(key);
    setValue(start.empty);
    setRestored(false);
  }, [key, start]);

  return [value, setValue, clear, restored];
}
