import { createHash, randomBytes, randomInt } from "node:crypto";

/** 256-bit random token, URL-safe. Used for sessions and invite links. */
export const randomToken = (): string => randomBytes(32).toString("base64url");

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Six-digit sign-in code. */
export const otpCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");
