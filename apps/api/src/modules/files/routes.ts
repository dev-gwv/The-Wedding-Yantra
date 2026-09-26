import type { FastifyInstance } from "fastify";
import { uploadFileInput } from "@wedding-yantra/types";
import type { Db } from "../../db.js";
import { assertId, forbidden, notFound, ok, parse } from "../../lib/http.js";
import { requireMember } from "../auth/guard.js";
import { readFile, uploadFile, verifySignature, type Files } from "./service.js";

export function fileRoutes(app: FastifyInstance, deps: { db: Db; files: Files }) {
  const { db, files } = deps;

  // Photos arrive base64 in JSON (simple for web and phone alike), so allow a bigger body here.
  app.post<{ Params: { workspaceId: string } }>(
    "/workspaces/:workspaceId/files",
    { bodyLimit: 8 * 1024 * 1024 },
    async (request, reply) => {
      const ctx = await requireMember(db, request, request.params.workspaceId);
      return reply.status(201).send(ok(await uploadFile(db, files, ctx, parse(uploadFileInput, request.body))));
    },
  );

  // The logo is on everything clients open, so it's public. The link names the file, so it never changes.
  app.get<{ Params: { workspaceId: string; fileId: string } }>("/public/logos/:workspaceId/:fileId", async (request, reply) => {
    const workspaceId = assertId(request.params.workspaceId, "This logo");
    const fileId = assertId(request.params.fileId, "This logo");
    const { rowCount } = await db.query(`SELECT 1 FROM workspaces WHERE id = $1 AND logo_file_id = $2 AND deleted_at IS NULL`, [workspaceId, fileId]);
    if (!rowCount) throw notFound("This logo");
    const file = await readFile(db, files, fileId);
    return reply
      .header("Content-Type", file.contentType)
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .header("X-Content-Type-Options", "nosniff")
      .header("Cross-Origin-Resource-Policy", "cross-origin")
      .send(file.data);
  });

  // Opened straight from <img> and links, so it's checked by the signature, not a sign-in header.
  app.get<{ Params: { id: string }; Querystring: { e?: string; s?: string } }>("/files/:id", async (request, reply) => {
    const id = assertId(request.params.id, "This file");
    if (!verifySignature(files.secret, id, request.query.e ?? "", request.query.s ?? "")) {
      throw forbidden("This link has expired. Open the page again to see the photo.");
    }
    const file = await readFile(db, files, id);
    return reply
      .header("Content-Type", file.contentType)
      .header("Content-Disposition", "inline")
      .header("Cache-Control", "private, max-age=3600")
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox")
      .send(file.data);
  });
}
