"use client";

import { useSyncExternalStore } from "react";

/**
 * The signed-in token and the chosen business live in the browser's storage.
 * The mobile app will keep the same two values in secure device storage.
 */
const TOKEN_KEY = "wy.token";
const WORKSPACE_KEY = "wy.workspace";
const EVENT = "wy-session";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the session lasts for this page only.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export const getToken = () => read(TOKEN_KEY);
export const setToken = (token: string | null) => write(TOKEN_KEY, token);
export const getWorkspaceId = () => read(WORKSPACE_KEY);
export const setWorkspaceId = (id: string | null) => write(WORKSPACE_KEY, id);

/** `undefined` while the page is still loading on the server, then the token or `null`. */
export function useToken(): string | null | undefined {
  return useSyncExternalStore(subscribe, getToken, () => undefined);
}

export function useWorkspaceId(): string | null | undefined {
  return useSyncExternalStore(subscribe, getWorkspaceId, () => undefined);
}

/** Where the last-seen data is kept on this device (see providers.tsx). */
export const CACHE_KEY = "wy.cache";

export function clearSession() {
  write(TOKEN_KEY, null);
  write(WORKSPACE_KEY, null);
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
}
