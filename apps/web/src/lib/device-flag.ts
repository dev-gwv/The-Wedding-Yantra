"use client";

import { useCallback, useSyncExternalStore } from "react";

/*
 * A yes/no remembered on this device (localStorage), like "Not now" on a card. Reading it goes
 * through useSyncExternalStore so every part of the screen that uses the same key agrees, and
 * blocked storage just means "not set".
 */

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function read(key: string | null): boolean {
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** [is it set, set it] for `key`; null means nothing to remember. */
export function useDeviceFlag(key: string | null): [boolean, () => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const set = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage blocked: it holds until the page is opened again.
    }
    listeners.forEach((l) => l());
  }, [key]);
  return [value, set];
}

const noSubscribe = () => () => undefined;

/** This site's address (https://…), or null while rendering on the server. */
export function useOrigin(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => null,
  );
}
