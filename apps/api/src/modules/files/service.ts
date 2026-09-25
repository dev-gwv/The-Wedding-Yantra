import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { can } from "@wedding-yantra/core";
import { MAX_UPLOAD_BYTES, type UploadedFile, type UploadType } from "@wedding-yantra/types";
import type { Db, Queryable } from "../../db.js";
import { AppError, forbidden, notFound } from "../../lib/http.js";
import type { FileStore } from "../../lib/storage.js";
import type { MemberContext } from "../auth/guard.js";

export interface Files {
  store: FileStore;
  /** Signs file links */
  secret: Buffer;
}

const EXTENSIONS: Record<UploadType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** What the bytes really are, from their first few bytes. Never trust the name or the label alone. */
function sniff(data: Buffer): UploadType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

const LINK_SECONDS = 24 * 60 * 60;

const signature = (secret: Buffer, id: string, expires: number) =>
  createHmac("sha256", secret).update(`${id}.${expires}`).digest("base64url");

/** A link that shows the file for a day. Works in <img> tags, so no sign-in header is needed. */
export function signedPath(secret: Buffer, id: string, now = Date.now()): string {
  // Rounded to the hour so the same file keeps the same link for a while (browser caching).
  const expires = Math.floor(now / 3_600_000) * 3600 + LINK_SECONDS;
  return `/api/v1/files/${id}?e=${expires}&s=${signature(secret, id, expires)}`;
}

export function verifySignature(secret: Buffer, id: string, expires: string, sig: string, now = Date.now()): boolean {
  const e = Number(expires);
  if (!Number.isInteger(e) || e * 1000 < now) return false;
  const expected = Buffer.from(signature(secret, id, e));
  const given = Buffer.from(sig ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function toUploaded(secret: Buffer, row: { id: string; content_type: string; size_bytes: number }): UploadedFile {
  return { id: row.id, path: signedPath(secret, row.id), contentType: row.content_type as UploadType, size: row.size_bytes };
}

export async function uploadFile(
  db: Db,
  files: Files,
  ctx: MemberContext,
  input: { contentType: UploadType; data: string; name?: string | null },
): Promise<UploadedFile> {
  if (!can(ctx.role, "expenses.submit")) throw forbidden("Your role can't upload files");
  const base64 = input.data.replace(/^data:[^;]+;base64,/, "");
  const data = Buffer.from(base64, "base64");
  if (data.length === 0) throw new AppError(400, "VALIDATION_ERROR", "That file is empty", { data: "That file is empty" });
  if (data.length > MAX_UPLOAD_BYTES) {
    throw new AppError(413, "FILE_TOO_LARGE", "That file is too big. Try a smaller photo.", { data: "Too big" });
  }
  if (sniff(data) !== input.contentType) {
    throw new AppError(400, "VALIDATION_ERROR", "Use a photo (JPG, PNG, WebP) or a PDF", { contentType: "Unsupported file" });
  }

  const id = randomUUID();
  const day = new Date();
  const key = `${ctx.workspaceId}/${day.getUTCFullYear()}/${String(day.getUTCMonth() + 1).padStart(2, "0")}/${id}.${EXTENSIONS[input.contentType]}`;
  await files.store.put(key, data);
  try {
    await db.query(
      `INSERT INTO files (id, workspace_id, storage_key, content_type, size_bytes, original_name, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ctx.workspaceId, key, input.contentType, data.length, input.name ?? null, ctx.userId],
    );
  } catch (err) {
    await files.store.remove(key);
    throw err;
  }
  return toUploaded(files.secret, { id, content_type: input.contentType, size_bytes: data.length });
}

/** Checks a file belongs to this business before it is attached to anything. */
export async function assertWorkspaceFile(db: Queryable, workspaceId: string, fileId: string): Promise<void> {
  const { rowCount } = await db.query(`SELECT 1 FROM files WHERE id = $1 AND workspace_id = $2`, [fileId, workspaceId]);
  if (!rowCount) throw new AppError(400, "VALIDATION_ERROR", "Add the photo again", { receiptFileId: "Add the photo again" });
}

export async function readFile(db: Db, files: Files, id: string): Promise<{ data: Buffer; contentType: string }> {
  const { rows } = await db.query<{ storage_key: string; content_type: string }>(
    `SELECT storage_key, content_type FROM files WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound("This file");
  return { data: await files.store.read(rows[0].storage_key), contentType: rows[0].content_type };
}
