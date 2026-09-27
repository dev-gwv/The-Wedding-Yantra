"use client";

import { Download } from "lucide-react";
import QRCode from "qrcode";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const INK = "#241803";

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const safeName = (s: string) => s.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "qr-code";

/** Wraps text into lines that fit the width. */
function lines(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/**
 * A print-ready PNG: 2400 px wide (8 inches at 300 dpi), the QR code with a quiet white
 * border, and a title and line underneath so a printed card says what it's for.
 */
export async function downloadQrPng(text: string, filename: string, title?: string, subtitle?: string) {
  const W = 2400;
  const pad = 200;
  const qrSize = W - pad * 2;
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, text, { width: qrSize, margin: 0, errorCorrectionLevel: "M", color: { dark: INK, light: "#FFFFFF" } });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = (size: number, weight: number) => `${weight} ${size}px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif`;
  ctx.font = font(120, 800);
  const titleLines = title ? lines(ctx, title, W - pad * 2) : [];
  ctx.font = font(76, 500);
  const subLines = subtitle ? lines(ctx, subtitle, W - pad * 2) : [];
  const textHeight = (titleLines.length ? titleLines.length * 150 + 40 : 0) + subLines.length * 100;
  canvas.width = W;
  canvas.height = pad + qrSize + (textHeight ? pad * 0.6 + textHeight : 0) + pad;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qr, pad, pad, qrSize, qrSize);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  let y = pad + qrSize + pad * 0.6;
  ctx.font = font(120, 800);
  for (const l of titleLines) {
    ctx.fillText(l, W / 2, y);
    y += 150;
  }
  if (titleLines.length) y += 40;
  ctx.font = font(76, 500);
  ctx.fillStyle = "#5c4a2a";
  for (const l of subLines) {
    ctx.fillText(l, W / 2, y);
    y += 100;
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't make the image");
  save(blob, `${safeName(filename)}.png`);
}

/** A vector SVG: sharp at any size, for a printer or designer. */
export async function downloadQrSvg(text: string, filename: string) {
  const svg = await QRCode.toString(text, { type: "svg", margin: 4, errorCorrectionLevel: "M", color: { dark: INK, light: "#FFFFFF" } });
  save(new Blob([svg], { type: "image/svg+xml" }), `${safeName(filename)}.svg`);
}

/** "Download for print" (HD PNG) and "SVG" buttons for any QR code. */
export function QrDownloadButtons({
  text,
  filename,
  title,
  subtitle,
  size = "md",
}: {
  text: string;
  filename: string;
  /** Printed under the code, e.g. the business name */
  title?: string;
  /** A second line under it, e.g. "Scan to send us your enquiry" */
  subtitle?: string;
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<"png" | "svg" | null>(null);
  async function run(kind: "png" | "svg") {
    setBusy(kind);
    try {
      if (kind === "png") await downloadQrPng(text, filename, title, subtitle);
      else await downloadQrSvg(text, filename);
      toast(kind === "png" ? "QR code downloaded, ready to print" : "QR code downloaded as SVG");
    } catch {
      toast("Couldn't download the QR code. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size={size} onClick={() => void run("png")} loading={busy === "png"} disabled={!text}>
        <Download className="size-4" /> Download for print (HD)
      </Button>
      <Button type="button" size={size} variant="secondary" onClick={() => void run("svg")} loading={busy === "svg"} disabled={!text}>
        SVG
      </Button>
    </div>
  );
}
