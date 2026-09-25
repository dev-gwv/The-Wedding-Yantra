import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/**
 * Where uploaded files live. Today: a folder on the server (a Docker volume on the VPS).
 * Swapping in S3 or R2 later means writing another FileStore; nothing else changes.
 */
export interface FileStore {
  put(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export function localFileStore(root: string): FileStore {
  const base = resolve(root);
  // Keys come from the API, never from users; this still refuses anything outside the folder.
  const pathOf = (key: string) => {
    const full = resolve(base, key);
    if (!full.startsWith(base + sep)) throw new Error("Invalid file key");
    return full;
  };
  return {
    async put(key, data) {
      const path = pathOf(key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data, { flag: "wx" });
    },
    read: (key) => readFile(pathOf(key)),
    remove: (key) => rm(pathOf(key), { force: true }),
  };
}

