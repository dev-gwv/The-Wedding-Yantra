import { OPTION_LISTS, type OptionList } from "@wedding-yantra/core";
import { z } from "zod";

// ---------------------------------------------------------------------------
// The business's own lists: payment modes, expense categories
// ---------------------------------------------------------------------------

export interface CustomOption {
  id: string;
  list: OptionList;
  /** What records store; never changes */
  key: string;
  label: string;
  position: number;
  /** Hidden from pickers; records that use it still show its name */
  archived: boolean;
  /** Came with the app (UPI, Cash, Materials…); can be renamed or hidden, not removed */
  builtin: boolean;
}

const label = z.string().trim().min(1, "Give it a name").max(40, "Keep it under 40 characters");

export const optionInput = z.object({ list: z.enum(OPTION_LISTS), label });
export type OptionInput = z.input<typeof optionInput>;

export const updateOptionInput = z.object({ label: label.optional(), archived: z.boolean().optional() });
export type UpdateOptionInput = z.input<typeof updateOptionInput>;

/** The whole list in its new order */
export const reorderOptionsInput = z.object({ list: z.enum(OPTION_LISTS), ids: z.array(z.uuid()).min(1).max(200) });
export type ReorderOptionsInput = z.input<typeof reorderOptionsInput>;

export const optionListQuery = z.object({ list: z.enum(OPTION_LISTS).optional() });

/** A key from the business's list, checked by the server */
export const optionKey = z.string().trim().min(1).max(60);
