import { MAX_UPLOAD_BYTES, type UploadType } from "@wedding-yantra/types";

const MAX_SIDE = 1600;

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Gets a bill photo ready to send: shrunk on the phone to 1600px as a JPEG (a few hundred
 * KB instead of several MB), turned the right way up. PDFs go as they are.
 */
export async function prepareUpload(file: File): Promise<{ contentType: UploadType; data: string; name: string }> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("That PDF is over 5 MB. Send a photo of the bill instead.");
    return { contentType: "application/pdf", data: await toBase64(file), name: file.name };
  }
  if (!file.type.startsWith("image/")) throw new Error("Use a photo of the bill, or a PDF");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read this photo. Try taking it again with the camera.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare this photo"))), "image/jpeg", 0.82),
  );
  return { contentType: "image/jpeg", data: await toBase64(blob), name: file.name.replace(/\.[^.]+$/, "") + ".jpg" };
}

/** A logo, shrunk to 512px. PNG and WebP stay PNG so a see-through background stays see-through. */
export async function prepareLogo(file: File): Promise<{ contentType: UploadType; data: string; name: string }> {
  if (!file.type.startsWith("image/")) throw new Error("Use a picture of your logo (JPG or PNG)");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read this picture. Try another one.");
  }
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = file.type === "image/png" || file.type === "image/webp" || file.type === "image/svg+xml";
  const type = png ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't prepare this picture"))), type, 0.9),
  );
  return { contentType: type, data: await toBase64(blob), name: `logo.${png ? "png" : "jpg"}` };
}
