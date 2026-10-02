import { z } from "zod";

export const SEARCH_KINDS = ["lead", "client", "event", "quote", "bill"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** One thing found by the search box: an enquiry, client, event, quote or invoice. */
export interface SearchResult {
  kind: SearchKind;
  id: string;
  /** The name to show, e.g. the client's name or the event title */
  title: string;
  /** A second line, e.g. "Sales · New · 9811122233" */
  subtitle: string | null;
  /** Where it opens in the app */
  href: string;
}

export interface SearchResults {
  q: string;
  results: SearchResult[];
}

export const searchQuery = z.object({
  q: z.string().trim().min(2, "Type at least 2 letters").max(60),
});

/** Someone with this phone number already on file: shown before adding them again. */
export interface PhoneMatch {
  leads: {
    /** Null when the viewer can't open that enquiry (someone else's) */
    id: string | null;
    name: string;
    stageName: string | null;
    assignedToName: string | null;
    createdAt: string;
  }[];
  clients: { id: string | null; name: string }[];
}

export const phoneMatchQuery = z.object({ phone: z.string().trim().min(6).max(20) });
