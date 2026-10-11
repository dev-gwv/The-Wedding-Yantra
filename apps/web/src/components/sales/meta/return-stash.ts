/**
 * What Facebook sends back to /connect/meta (`code` and `state`, or `error`), kept in this
 * tab's storage until it's used. It's saved before anything else happens, so a sign-in in
 * between doesn't lose it, and so it can come out of the address bar and history at once.
 */
export interface MetaReturn {
  code: string | null;
  state: string | null;
  error: string | null;
  /** When it came back (ms) */
  at: number;
}

const KEY = "wy.meta.return";
const EVENT = "wy-meta-return";
/** Facebook's login link only lasts 15 minutes; anything older is of no use. */
const MAX_AGE = 30 * 60 * 1000;

// Private mode can block storage: then it lasts for this page only.
let memory: string | null = null;

export function readReturnRaw(): string | null {
  try {
    return window.sessionStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function write(value: string | null) {
  memory = value;
  try {
    if (value === null) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, value);
  } catch {
    // Kept in memory above.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function saveReturn(value: MetaReturn) {
  write(JSON.stringify(value));
}

export function clearReturn() {
  write(null);
}

export function subscribeReturn(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function parseReturn(raw: string | null | undefined): MetaReturn | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<MetaReturn> | null;
    if (!v || typeof v !== "object" || typeof v.at !== "number") return null;
    const text = (x: unknown) => (typeof x === "string" && x ? x : null);
    return { code: text(v.code), state: text(v.state), error: text(v.error), at: v.at };
  } catch {
    return null;
  }
}

/** Forget one left over from an earlier try. */
export function dropStaleReturn(now = Date.now()) {
  const saved = parseReturn(readReturnRaw());
  if (saved && now - saved.at > MAX_AGE) clearReturn();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The business the login was started from, read from the `state` Facebook hands back. Only
 * used to pick which business to ask: the server checks the state's signature and the owner.
 */
export function stateWorkspace(state: string | null): string | null {
  const payload = state?.split(".")[0];
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    const w = parsed && typeof parsed === "object" ? (parsed as { w?: unknown }).w : null;
    return typeof w === "string" && UUID.test(w) ? w : null;
  } catch {
    return null;
  }
}
