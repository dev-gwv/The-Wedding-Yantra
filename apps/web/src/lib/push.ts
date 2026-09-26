"use client";

import type { ApiClient } from "@wedding-yantra/api-client";

/**
 * Alerts on this phone or computer (web push). They arrive even when the app is closed,
 * once it's installed (iPhone: Add to Home Screen first) and the person says yes.
 */
export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isInstalled() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  // The app registers it on load; make sure it's there if alerts are turned on first.
  return navigator.serviceWorker.register("/sw.js").catch(() => null);
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  // iPhones only allow alerts for apps added to the Home Screen.
  if (isIos() && !isInstalled()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Asks for permission and subscribes this device. Resolves to the new state. */
export async function enablePush(api: ApiClient): Promise<PushState> {
  if (!pushSupported()) return pushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await registration();
  if (!reg) return "unsupported";
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.push.key();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another key can't receive ours.
  if (sub && sub.options.applicationServerKey) {
    const current = new Uint8Array(sub.options.applicationServerKey);
    const wanted = keyBytes(publicKey);
    if (current.length !== wanted.length || current.some((b, i) => b !== wanted[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const json = sub.toJSON();
  await api.push.subscribe({ endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } });
  return "on";
}

/** Stops alerts on this device (also used when signing out). */
export async function disablePush(api: ApiClient | null): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (api) await api.push.unsubscribe(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}
