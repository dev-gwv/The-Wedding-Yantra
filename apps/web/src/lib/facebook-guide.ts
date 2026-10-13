import { leadAccessSteps, META_TEST_TOOL_URL, metaTestToolSteps } from "@wedding-yantra/core";

/**
 * "Connect your Facebook & Instagram lead ads": the guide's words, kept as data so the public
 * page (shareable with an agency) and the page inside Leads say exactly the same thing.
 * Simple English: one idea per line, the words people will see on the screen in bold quotes.
 */

/** The public guide, readable without signing in. */
export const GUIDE_PATH = "/guides/facebook-leads";
/** The same guide inside Leads, with the owner's progress on top. */
export const APP_GUIDE_PATH = "/app/leads/connect-facebook";
export const FACEBOOK_SETTINGS_PATH = "/app/settings/facebook-leads";

export type GuidePictureKind =
  | "facebook-page"
  | "page-admin"
  | "instagram-linked"
  | "lead-form"
  | "leads-card"
  | "continue-button"
  | "facebook-login"
  | "page-picker"
  | "switch-on"
  | "who-gets"
  | "test-lead";

export interface GuideStep {
  id: string;
  title: string;
  /** What to do, one short line each */
  lines: string[];
  /** "How to check" */
  check?: string;
  /** What to do when it isn't so */
  ifNot?: string;
  tip?: string;
  link?: { href: string; label: string };
  picture?: GuidePictureKind;
  /** Inside the app this step is where they already are */
  inApp?: string;
}

export interface GuidePart {
  id: string;
  title: string;
  where: string;
  intro: string;
  steps: GuideStep[];
}

export const GUIDE_TITLE = "Get your Facebook & Instagram leads in Wedding Yantra";
export const GUIDE_INTRO = [
  "When someone fills the form on your Facebook or Instagram ad, their name and number come to Leads in a few seconds.",
  "Your salesperson gets an alert on their phone.",
  "You set it up once. It takes about 10 minutes.",
];

export const GUIDE_PARTS: GuidePart[] = [
  {
    id: "before",
    title: "Before you start",
    where: "On Facebook",
    intro: "Check these 4 things first. If you already run lead ads, most are done.",
    steps: [
      {
        id: "page",
        title: "You have a Facebook Page for your business",
        lines: ["A Page is your business's own page on Facebook.", "It is not your personal profile."],
        check: "Open Facebook. Tap the menu (☰), then “Pages”. Your business name shows there.",
        ifNot: "Make one at facebook.com/pages/create. It is free.",
        link: { href: "https://www.facebook.com/pages/create", label: "Make a Page" },
        picture: "facebook-page",
      },
      {
        id: "admin",
        title: "You are an admin of that Page",
        lines: ["You need “Full control” of the Page.", "Use the same Facebook account when you connect."],
        check: "On a computer, open business.facebook.com. Go to Settings, then Pages. Pick your Page and open People. Your name shows “Full control”.",
        ifNot: "If an agency or a staff member made the Page, ask them to give you full control.",
        picture: "page-admin",
      },
      {
        id: "instagram",
        title: "Instagram ads only: Instagram is linked to the Page",
        lines: ["Your Instagram must be a professional (business or creator) account.", "It must be linked to your Facebook Page."],
        check: "On Instagram, open your profile, tap the menu (☰), then “Accounts Centre”. Your Facebook Page shows there.",
        ifNot: "In Accounts Centre, tap “Add accounts” and add your Facebook Page.",
        picture: "instagram-linked",
      },
      {
        id: "form",
        title: "You have a lead form (Instant Form)",
        lines: [
          "The lead form is the form people fill inside your ad.",
          "Make one at business.facebook.com: All tools, then Instant forms, then “Create form”.",
          "Or make it while you create an ad with the “Leads” goal.",
        ],
        tip: "Good questions for weddings: Full name, Phone number, City, Wedding date, Budget, Which functions. Use tick-box answers for budget and functions; they come in cleaner.",
        link: { href: "https://business.facebook.com/latest/instant_forms", label: "Open Instant forms" },
        picture: "lead-form",
      },
    ],
  },
  {
    id: "connect",
    title: "Connect your Page",
    where: "In Wedding Yantra (the business owner does this)",
    intro: "Only the owner of the business in Wedding Yantra can connect Facebook.",
    steps: [
      {
        id: "open",
        title: "Open Leads, then “Connect Facebook”",
        lines: ["In Wedding Yantra, open Leads and tap “Connect now”.", "Or open Settings, then “Facebook & Instagram leads”."],
        inApp: "You're here. Use the steps at the top of this page.",
        picture: "leads-card",
      },
      {
        id: "continue",
        title: "Tap “Continue with Facebook”",
        lines: ["Facebook opens.", "Nothing is posted on your Page."],
        picture: "continue-button",
      },
      {
        id: "login",
        title: "Log in to Facebook",
        lines: ["Use the Facebook account that is admin of your Page.", "Then tap “Continue as (your name)”."],
        picture: "facebook-login",
      },
      {
        id: "choose",
        title: "Tick your Page and keep every switch ON",
        lines: [
          "Tick the Page your ads run from.",
          "For Instagram ads, tick the Page your Instagram is linked to.",
          "Do not switch anything off. Tap “Save”, then “Got it”.",
        ],
        picture: "page-picker",
      },
      {
        id: "switch-on",
        title: "Back in Wedding Yantra, tap “Switch on”",
        lines: ["Tick your Page and tap “Switch on”.", "You'll see a green “Receiving leads”."],
        picture: "switch-on",
      },
      {
        id: "who",
        title: "Choose who gets the leads",
        lines: [
          "“Everyone with the Leads screen”: each new lead goes to whoever has the fewest open leads.",
          "Or “Only the people I pick”.",
          "People on leave today are skipped.",
        ],
        picture: "who-gets",
      },
      {
        id: "test",
        title: "Send a test lead",
        lines: ["Under your form, tap “Send a test lead”.", "In a few seconds you'll see “Test lead received”.", "Test leads go to you, not to your salespeople."],
        picture: "test-lead",
      },
    ],
  },
];

export const GUIDE_DONE = [
  "That's it. New leads from your ads now come into Leads by themselves.",
  "Keep your ads running as usual. You don't need to download leads from Facebook any more.",
];

export interface GuideQuestion {
  id: string;
  q: string;
  lines?: string[];
  steps?: string[];
  link?: { href: string; label: string };
}

export const GUIDE_FAQ: GuideQuestion[] = [
  {
    id: "no-page",
    q: "I can't see my Page on Facebook's list",
    lines: [
      "You may not be an admin of the Page, or you logged in with a different Facebook account.",
      "Ask the Page owner to give you full control. Then tap “Continue with Facebook” again and tick the Page.",
    ],
  },
  {
    id: "no-test-lead",
    q: "The test lead didn't come",
    lines: ["Wait one minute and tap “Check again”. If it still doesn't come, send one with Meta's testing tool:"],
    steps: metaTestToolSteps(),
    link: { href: META_TEST_TOOL_URL, label: "Open the testing tool" },
  },
  {
    id: "leads-access",
    q: "A red box says “Facebook is not letting Wedding Yantra read leads”",
    lines: ["Your business has turned on “Leads access” on Facebook. An admin of your Facebook business must allow Wedding Yantra:"],
    steps: [...leadAccessSteps(), "Come back to Wedding Yantra and tap “Check again”."],
  },
  {
    id: "log-in-again",
    q: "It says “Facebook wants you to log in again”",
    lines: [
      "Facebook asks for this about every 90 days, and after a password change.",
      "Tap “Log in again” and tick the same Page. Leads that came in meanwhile are brought in.",
    ],
  },
  {
    id: "person-left",
    q: "I changed my Facebook password, or the person who connected left",
    lines: ["Open Settings, then “Facebook & Instagram leads”, and tap “Reconnect” with an account that stays."],
  },
  {
    id: "agency",
    q: "An agency runs my ads",
    lines: [
      "That's fine. The leads belong to your Page, whoever runs the ads.",
      "Connect your Page yourself, or send this guide to the agency on WhatsApp so they can help.",
    ],
  },
  {
    id: "other-business",
    q: "It says “This Page already sends its leads to another business”",
    lines: [
      "The Page is connected to another business on Wedding Yantra.",
      "Disconnect it there, or tap “Move it here” if you have full control of the Page.",
    ],
  },
  {
    id: "privacy",
    q: "Will Wedding Yantra post on my Page or read my messages?",
    lines: ["No. Wedding Yantra only reads the answers people give in your lead forms."],
  },
  {
    id: "old-leads",
    q: "Do my old leads come in?",
    lines: [
      "No. Only leads from the moment you connect.",
      "You can download older leads from business.facebook.com, under Instant forms.",
    ],
  },
  {
    id: "whatsapp-ads",
    q: "My WhatsApp or Messenger ads",
    lines: ["Those ads start a chat, not a form, so they don't come here. Only lead form ads do. Keep answering chats as before."],
  },
  {
    id: "stop",
    q: "How do I stop?",
    lines: ["Open Settings, then “Facebook & Instagram leads”, and tap “Disconnect”. Leads already in Wedding Yantra stay."],
  },
];

/** The WhatsApp message for sending the guide to whoever runs the ads. */
export const guideShareText = (url: string) =>
  `Please help me connect our Facebook and Instagram lead ads to Wedding Yantra, so new leads come in by themselves. The steps are here: ${url}`;

/** The tutorial video: one that ships with the app, unless the site sets its own. */
export type GuideVideo =
  /** A YouTube video, played in a privacy-friendly player */
  | { kind: "youtube"; href: string; embed: string; poster: string; duration: string | null }
  /** A video file (ours, or an export from an AI video tool); `sound` when we know it talks */
  | {
      kind: "file";
      href: string;
      sources: { src: string; type: string }[];
      poster: string | null;
      duration: string | null;
      sound?: true;
      /** WebVTT captions of what's said */
      captions?: string;
    }
  /** Any other page with the video: opened in a new tab */
  | { kind: "link"; href: string; poster: null; duration: null };

/**
 * The animated tutorial that ships with the app (made by scripts/guide-video/): the real
 * screens with a voice-over, and captions of what's said.
 */
export const BUILT_IN_VIDEO: GuideVideo = {
  kind: "file",
  href: "/videos/connect-facebook.mp4",
  // MP4 for phones and most browsers; WebM for browsers without H.264.
  sources: [
    { src: "/videos/connect-facebook.mp4", type: "video/mp4" },
    { src: "/videos/connect-facebook.webm", type: "video/webm" },
  ],
  poster: "/videos/connect-facebook.jpg",
  duration: "1:25",
  sound: true,
  captions: "/videos/connect-facebook.vtt",
};

/**
 * The video for the guide and the corner of Leads. NEXT_PUBLIC_FACEBOOK_GUIDE_VIDEO_URL
 * replaces the built-in one: a YouTube link, or a direct .mp4/.webm link (an AI presenter
 * video, for example). An https link to anything else opens in a new tab.
 */
export function guideVideo(raw: string | undefined = process.env.NEXT_PUBLIC_FACEBOOK_GUIDE_VIDEO_URL): GuideVideo {
  const value = raw?.trim();
  if (!value) return BUILT_IN_VIDEO;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return BUILT_IN_VIDEO;
  }
  if (url.protocol !== "https:") return BUILT_IN_VIDEO;
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com") id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
  if (id && /^[\w-]{6,20}$/.test(id)) {
    return {
      kind: "youtube",
      href: url.toString(),
      embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
      poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      duration: null,
    };
  }
  const file = url.pathname.toLowerCase().match(/\.(mp4|webm)$/)?.[1];
  if (file) return { kind: "file", href: url.toString(), sources: [{ src: url.toString(), type: `video/${file}` }], poster: null, duration: null };
  return { kind: "link", href: url.toString(), poster: null, duration: null };
}
