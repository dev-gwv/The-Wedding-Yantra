import type { AuthSession, Me, OtpRequestResult, User } from "@wedding-yantra/types";
import type { Db, Queryable } from "../../db.js";
import { otpCode, randomToken, sha256 } from "../../lib/crypto.js";
import { AppError } from "../../lib/http.js";
import type { OtpSender } from "./otp-sender.js";

const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_PHONE = 5; // per 15 minutes
const OTP_MAX_PER_IP = 20; // per 15 minutes
const SESSION_TTL_DAYS = 60;

interface UserRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  created_at: Date;
}

export const toUser = (row: UserRow): User => ({
  id: row.id,
  phone: row.phone,
  name: row.name,
  email: row.email,
  createdAt: row.created_at.toISOString(),
});

const hashCode = (phone: string, code: string) => sha256(`${phone}:${code}`);

export async function requestOtp(
  db: Db,
  sender: OtpSender,
  input: { phone: string; ip: string; echo: boolean },
): Promise<OtpRequestResult> {
  const { rows } = await db.query<{ by_phone: string; by_ip: string }>(
    `SELECT count(*) FILTER (WHERE phone = $1)        AS by_phone,
            count(*) FILTER (WHERE requested_ip = $2) AS by_ip
       FROM otp_codes
      WHERE created_at > now() - interval '15 minutes'`,
    [input.phone, input.ip],
  );
  if (Number(rows[0]?.by_phone) >= OTP_MAX_PER_PHONE || Number(rows[0]?.by_ip) >= OTP_MAX_PER_IP) {
    throw new AppError(429, "TOO_MANY_REQUESTS", "Too many codes requested. Please wait 15 minutes and try again.");
  }

  const code = otpCode();
  // A new code replaces any earlier unused one for this number.
  await db.query(`UPDATE otp_codes SET consumed_at = now() WHERE phone = $1 AND consumed_at IS NULL`, [input.phone]);
  await db.query(
    `INSERT INTO otp_codes (phone, code_hash, expires_at, requested_ip)
     VALUES ($1, $2, now() + make_interval(secs => $3), $4)`,
    [input.phone, hashCode(input.phone, code), OTP_TTL_SECONDS, input.ip],
  );
  await sender.send(input.phone, code);

  const result: OtpRequestResult = { sent: true, phone: input.phone, expiresInSeconds: OTP_TTL_SECONDS };
  if (input.echo) result.devCode = code;
  return result;
}

export async function verifyOtp(
  db: Db,
  input: { phone: string; code: string; userAgent: string | null },
): Promise<AuthSession> {
  const { rows } = await db.query<{ id: string; code_hash: string; attempts: number; expired: boolean }>(
    `SELECT id, code_hash, attempts, expires_at < now() AS expired
       FROM otp_codes
      WHERE phone = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [input.phone],
  );
  const otp = rows[0];
  const wrongCode = (message: string) => new AppError(400, "INVALID_CODE", message, { code: message });

  if (!otp || otp.expired) throw wrongCode("This code has expired. Ask for a new one.");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw wrongCode("Too many wrong tries. Ask for a new code.");
  if (otp.code_hash !== hashCode(input.phone, input.code)) {
    await db.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
    throw wrongCode("That code is not right. Check and try again.");
  }
  // Claim the code atomically so two simultaneous requests can't both sign in with it.
  const claimed = await db.query(`UPDATE otp_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL`, [
    otp.id,
  ]);
  if (claimed.rowCount !== 1) throw wrongCode("This code was already used. Ask for a new one.");

  const upsert = await db.query<UserRow & { inserted: boolean }>(
    `INSERT INTO users (phone) VALUES ($1)
     ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
     RETURNING id, phone, name, email, created_at, (xmax = 0) AS inserted`,
    [input.phone],
  );
  const row = upsert.rows[0]!;

  const token = randomToken();
  const session = await db.query<{ expires_at: Date }>(
    `INSERT INTO sessions (user_id, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))
     RETURNING expires_at`,
    [row.id, sha256(token), input.userAgent?.slice(0, 300) ?? null, SESSION_TTL_DAYS],
  );

  return {
    token,
    expiresAt: session.rows[0]!.expires_at.toISOString(),
    user: toUser(row),
    isNewUser: row.inserted || !row.name,
  };
}

/** Resolves a bearer token to a signed-in person, or null if it is unknown, expired or revoked. */
export async function authenticate(db: Db, token: string): Promise<{ userId: string; sessionId: string } | null> {
  const { rows } = await db.query<{ id: string; user_id: string; stale: boolean }>(
    `SELECT id, user_id, last_used_at < now() - interval '1 hour' AS stale
       FROM sessions
      WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [sha256(token)],
  );
  const session = rows[0];
  if (!session) return null;
  if (session.stale) {
    // Sliding expiry, written at most once an hour per device.
    await db.query(
      `UPDATE sessions SET last_used_at = now(), expires_at = now() + make_interval(days => $2) WHERE id = $1`,
      [session.id, SESSION_TTL_DAYS],
    );
  }
  return { userId: session.user_id, sessionId: session.id };
}

export async function logout(db: Db, sessionId: string): Promise<void> {
  await db.query(`UPDATE sessions SET revoked_at = now() WHERE id = $1`, [sessionId]);
}

export async function getUser(db: Queryable, userId: string): Promise<User> {
  const { rows } = await db.query<UserRow>(`SELECT id, phone, name, email, created_at FROM users WHERE id = $1`, [
    userId,
  ]);
  if (!rows[0]) throw new AppError(401, "UNAUTHORIZED", "Please sign in again");
  return toUser(rows[0]);
}

export async function getMe(db: Db, userId: string): Promise<Me> {
  const user = await getUser(db, userId);
  const { rows } = await db.query<{
    id: string;
    name: string;
    business_type_id: string;
    business_type_name: string;
    business_type_icon: string;
    role: Me["workspaces"][number]["role"];
  }>(
    `SELECT w.id, w.name, w.business_type_id, bt.name AS business_type_name, bt.icon AS business_type_icon, m.role
       FROM memberships m
       JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
       JOIN business_types bt ON bt.id = w.business_type_id
      WHERE m.user_id = $1 AND m.removed_at IS NULL
      ORDER BY m.created_at`,
    [userId],
  );
  return {
    user,
    workspaces: rows.map((r) => ({
      id: r.id,
      name: r.name,
      businessTypeId: r.business_type_id,
      businessTypeName: r.business_type_name,
      businessTypeIcon: r.business_type_icon,
      role: r.role,
    })),
  };
}

export async function updateMe(db: Db, userId: string, input: { name: string; email: string | null }): Promise<User> {
  const { rows } = await db.query<UserRow>(
    `UPDATE users SET name = $2, email = $3 WHERE id = $1 RETURNING id, phone, name, email, created_at`,
    [userId, input.name, input.email],
  );
  return toUser(rows[0]!);
}

/** Housekeeping: removes old sign-in codes and dead sessions. Safe to run any time. */
export async function cleanupAuth(db: Db): Promise<void> {
  await db.query(`DELETE FROM otp_codes WHERE created_at < now() - interval '1 day'`);
  await db.query(
    `DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`,
  );
}
