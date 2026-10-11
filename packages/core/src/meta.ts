/**
 * Facebook and Instagram lead ads: what each problem with a connected Page says, and the
 * exact steps to fix it, in plain words. The API sends these with the Page's status, and the
 * web app shows them in a red or amber box with "Send these steps to your Facebook admin".
 */
import { formatDate } from "./dates.js";

export const META_PROBLEM_KINDS = [
  "needs_reconnect",
  "lead_access",
  "not_subscribed",
  "permission_missing",
  "reconnect_soon",
  "connector_left",
  "quiet",
  "failed_leads",
  "meta_outage",
] as const;
export type MetaProblemKind = (typeof META_PROBLEM_KINDS)[number];

/** Red: leads have stopped. Amber: they still arrive, but something needs doing soon. */
export function metaProblemTone(kind: MetaProblemKind): "red" | "amber" {
  return kind === "reconnect_soon" || kind === "connector_left" || kind === "quiet" || kind === "meta_outage" ? "amber" : "red";
}

/** What the API knows about the problem, to name things in the steps. */
export interface MetaProblemFacts {
  /** The Facebook Page's name */
  pageName?: string | null;
  /** Who connected Facebook */
  who?: string | null;
  /** YYYY-MM-DD: log in to Facebook again by this day */
  by?: string | null;
  /** Leads that couldn't be brought in */
  count?: number | null;
  /** Days without a lead */
  days?: number | null;
}

/** Meta's Lead Ads Testing Tool, for sending a test lead by hand. */
export const META_TEST_TOOL_URL = "https://developers.facebook.com/tools/lead-ads-testing";

const page = (f: MetaProblemFacts) => (f.pageName?.trim() ? `“${f.pageName.trim()}”` : "your Page");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The Leads Access steps, done on business.facebook.com by an admin of the business there. */
function leadAccessSteps(f: MetaProblemFacts): string[] {
  return [
    "On a computer, open business.facebook.com and go to Settings.",
    "Open Integrations, then Leads access.",
    `Choose the Page ${page(f)}.`,
    "Open CRMs, tap Assign CRMs, pick Wedding Yantra and tap Assign.",
    `Then open People and make sure ${f.who?.trim() || "the person who connected Facebook"} is listed. If not, add them.`,
  ];
}

/** The heading and the steps to fix one problem. */
export function metaProblem(kind: MetaProblemKind, f: MetaProblemFacts = {}): { title: string; steps: string[] } {
  switch (kind) {
    case "needs_reconnect":
      return {
        title: `Leads from ${page(f)} have stopped: log in to Facebook again`,
        steps: [
          "Tap Reconnect.",
          `Log in to Facebook and tick ${page(f)}.`,
          "Leads that came in meanwhile will arrive by themselves.",
        ],
      };
    case "lead_access":
      return {
        title: `Facebook is not letting Wedding Yantra read leads from ${page(f)}`,
        steps: [...leadAccessSteps(f), "Come back here and tap Check again."],
      };
    case "not_subscribed":
      return {
        title: `Facebook isn't sending leads from ${page(f)}`,
        steps: ["Tap Check again. We'll ask Facebook to send them again.", `If this stays, tap Reconnect and tick ${page(f)}.`],
      };
    case "permission_missing":
      return {
        title: "Some Facebook permissions were not given",
        steps: [
          "Tap Reconnect.",
          "When Facebook asks, keep every option switched on.",
          `Tick ${page(f)} and finish.`,
          "You need full control of the Page, or access to make ads on it. If you don't have this, ask whoever does to connect it.",
        ],
      };
    case "reconnect_soon":
      return {
        title: f.by ? `Log in to Facebook again by ${formatDate(f.by, { year: false })}` : "Log in to Facebook again soon",
        steps: [
          "Facebook asks for this every 90 days to keep sharing your leads.",
          "Tap Reconnect and log in. It takes a minute.",
          "Leads keep coming in meanwhile.",
        ],
      };
    case "connector_left":
      return {
        title: `${f.who?.trim() || "The person who connected Facebook"} has left the business`,
        steps: ["Leads still arrive for now.", "To keep them coming, tap Reconnect and log in with your own Facebook."],
      };
    case "quiet":
      return {
        title: `No leads from ${page(f)} for ${plural(f.days ?? 3, "day")}`,
        steps: ["Check in Ads Manager that your lead ads are still running.", "Send a test lead from here to check the connection."],
      };
    case "failed_leads":
      return {
        title: `Couldn't bring in ${plural(f.count ?? 1, "lead")} from ${page(f)}`,
        steps: ["Tap Try again.", "If they still don't come in, tap Check again to see what Facebook says."],
      };
    case "meta_outage":
      return {
        title: "We're fixing a Facebook connection problem",
        steps: ["Nothing to do on your side.", "Leads will arrive by themselves once it's fixed."],
      };
  }
}

/**
 * "Send these steps to your Facebook admin": a WhatsApp message for whoever looks after the
 * business on Facebook. Null for problems only the owner can fix in the app.
 */
export function metaAdminMessage(kind: MetaProblemKind, f: MetaProblemFacts = {}): string | null {
  const steps =
    kind === "lead_access"
      ? leadAccessSteps(f)
      : kind === "permission_missing"
        ? [
            `Open facebook.com, go to ${page(f)} and open Settings, then Page access.`,
            `Give ${f.who?.trim() || "me"} full control of the Page, or access to make ads on it.`,
          ]
        : null;
  if (!steps) return null;
  const lines = [
    `*Please help: Facebook leads for ${page(f)}*`,
    "We use Wedding Yantra to get our Facebook and Instagram leads. Facebook needs an admin of our business to allow it:",
    "",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Please tell me once it's done. Thank you!",
  ];
  return lines.join("\n");
}

/** When Meta won't make a test lead for us: the same thing by hand in Meta's testing tool. */
export function metaTestToolSteps(f: { pageName?: string | null; formName?: string | null } = {}): string[] {
  return [
    `Open Meta's Lead Ads Testing Tool (${META_TEST_TOOL_URL}) and log in.`,
    `Pick the Page ${f.pageName?.trim() ? `“${f.pageName.trim()}”` : "you connected"} and the form${f.formName?.trim() ? ` “${f.formName.trim()}”` : ""}, then tap Create lead.`,
    "Come back here: the test lead shows below within a minute.",
  ];
}
