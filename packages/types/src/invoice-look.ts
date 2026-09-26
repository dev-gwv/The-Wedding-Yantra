import { z } from "zod";

// ---------------------------------------------------------------------------
// How the invoice page looks
// ---------------------------------------------------------------------------

export const INVOICE_DESIGNS = ["classic", "modern", "minimal", "bold"] as const;
export type InvoiceDesign = (typeof INVOICE_DESIGNS)[number];
export const INVOICE_DESIGN_INFO: Record<InvoiceDesign, { name: string; about: string }> = {
  classic: { name: "Classic", about: "Clean lines, your colour on the title and total" },
  modern: { name: "Modern", about: "A band of your colour across the top" },
  minimal: { name: "Minimal", about: "Quiet and airy, almost no lines" },
  bold: { name: "Bold", about: "Big title, a coloured edge and total box" },
};

/** Colours that read well with white text on them, for the accent picker. */
export const INVOICE_ACCENTS = [
  { hex: "#E85C00", name: "Saffron" },
  { hex: "#B91C1C", name: "Sindoor" },
  { hex: "#9D174D", name: "Rani pink" },
  { hex: "#6B21A8", name: "Plum" },
  { hex: "#1D4ED8", name: "Royal blue" },
  { hex: "#0F766E", name: "Peacock" },
  { hex: "#15803D", name: "Mehendi" },
  { hex: "#A16207", name: "Gold" },
  { hex: "#1F2937", name: "Charcoal" },
] as const;

export const invoiceAccent = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^#[0-9A-F]{6}$/, "Pick a colour like #E85C00");
