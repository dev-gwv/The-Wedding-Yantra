import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 256-bit random token, URL-safe. Used for sessions and invite links. */
export const randomToken = (): string => randomBytes(32).toString("base64url");

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Six-digit sign-in code. */
export const otpCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");

/**
 * Encrypts a secret for storing (Facebook tokens): AES-256-GCM with a fresh 12-byte IV,
 * as "v1.<iv>.<tag>.<ciphertext>" in base64url. `aad` ties it to where it belongs (e.g. the
 * business and Page), so a value copied to another row won't open.
 */
export function seal(plain: string, key: Buffer, aad: string): string {
  if (key.length !== 32) throw new Error("The sealing key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Opens a value from `seal`. Throws if it was changed, or the key or `aad` don't match. */
export function unseal(sealed: string, key: Buffer, aad: string): string {
  const [version, ivPart, tagPart, ciphertextPart, ...rest] = sealed.split(".");
  if (version !== "v1" || ivPart === undefined || tagPart === undefined || ciphertextPart === undefined || rest.length) {
    throw new Error("Not a sealed value");
  }
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  if (key.length !== 32 || iv.length !== 12 || tag.length !== 16) throw new Error("Not a sealed value");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The sealed value doesn't match its key or place");
  }
}

/** Whether `hex` is the HMAC-SHA256 of the raw body with `secret`, compared in constant time. */
export function validHmacHex(raw: Buffer | string, hex: string | undefined, secret: string | Buffer): boolean {
  if (!hex) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
  const given = Buffer.from(hex);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Meta signs each webhook post: X-Hub-Signature-256 is "sha256=<hex HMAC of the raw body with the app secret>". */
export function validMetaSignature(raw: Buffer | string, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  return validHmacHex(raw, header.slice("sha256=".length), appSecret);
}

/**
 * Proves to Meta that a call with `accessToken` comes from our server: the HMAC-SHA256 of the
 * token, keyed with the app secret, in hex. The real Graph client and the fake both use this.
 */
export const appSecretProof = (accessToken: string, appSecret: string): string =>
  createHmac("sha256", appSecret).update(accessToken).digest("hex");

/**
 * What the Facebook sign-in carries through Meta and back: business (w), person (u), a
 * single-use nonce (n), expiry in Unix seconds (x), and an optional marker (r) the connect
 * flow may use (e.g. "rerequest" when asking again for refused permissions).
 */
export interface OAuthState {
  w: string;
  u: string;
  n: string;
  x: number;
  r?: string;
}

/** The state is signed with its own key, derived from META_TOKEN_KEY, never with the key itself. */
const stateKey = (tokenKey: Buffer): Buffer => createHmac("sha256", tokenKey).update("meta-oauth-state").digest();

/** "payload.signature", both base64url: the payload is JSON, the signature HMAC-SHA256 of the payload part. */
export function signState(state: OAuthState, tokenKey: Buffer): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = createHmac("sha256", stateKey(tokenKey)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

/** The state's contents when the signature is right and it hasn't expired; otherwise null. */
export function verifyState(state: string, tokenKey: Buffer, nowSec = Math.floor(Date.now() / 1000)): OAuthState | null {
  if (typeof state !== "string") return null;
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts as [string, string];
  const given = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", stateKey(tokenKey)).update(payload).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  if (typeof s.w !== "string" || typeof s.u !== "string" || typeof s.n !== "string" || typeof s.x !== "number") return null;
  if (s.r !== undefined && typeof s.r !== "string") return null;
  if (s.x <= nowSec) return null;
  return { w: s.w, u: s.u, n: s.n, x: s.x, ...(s.r !== undefined ? { r: s.r as string } : {}) };
}

/** What Meta puts in a deauthorize or data-deletion `signed_request`. */
export interface SignedRequest {
  algorithm: string;
  user_id?: string;
  issued_at?: number;
  [key: string]: unknown;
}

/**
 * Meta's `signed_request` ("<sig>.<payload>", base64url): the payload when the signature is the
 * HMAC-SHA256 of the payload part with the app secret and the algorithm is HMAC-SHA256; else null.
 * Never throws, whatever is sent.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): SignedRequest | null {
  if (typeof signedRequest !== "string") return null;
  const parts = signedRequest.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [signaturePart, payload] = parts as [string, string];
  const given = Buffer.from(signaturePart, "base64url");
  // timingSafeEqual throws on different lengths, so check first.
  if (given.length !== 32) return null;
  const expected = createHmac("sha256", appSecret).update(payload).digest();
  if (!timingSafeEqual(given, expected)) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as SignedRequest;
  if (typeof data.algorithm !== "string" || data.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  return data;
}
