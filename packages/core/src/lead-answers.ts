/**
 * Reading a lead form's answers into an enquiry. Facebook and Instagram lead forms ask
 * whatever the business chose, in English or Hinglish. Standard questions are matched by
 * their key first, then by words in the question. A lead is never dropped because an
 * answer couldn't be read: whatever isn't used goes into the requirements, word for word.
 * Pure: the API reads leads with it and the web app shows "How we read this form".
 */
import { normalizePhone } from "./phone.js";

/** Which enquiry field an answer filled. */
export type LeadAnswerUse = "name" | "phone" | "email" | "city" | "venue" | "eventType" | "eventDate" | "guestCount" | "budget";

export const LEAD_ANSWER_USE_LABELS: Record<LeadAnswerUse, string> = {
  name: "Name",
  phone: "Phone",
  email: "Email",
  city: "City",
  venue: "Venue",
  eventType: "Event",
  eventDate: "Event date",
  guestCount: "Guests",
  budget: "Budget",
};

/** The same keys as the enquiry's event types. */
export type LeadAnswerEventType =
  | "wedding"
  | "engagement"
  | "pre_wedding"
  | "haldi"
  | "mehendi"
  | "sangeet"
  | "reception"
  | "birthday"
  | "anniversary"
  | "baby_shower"
  | "corporate"
  | "other";

/**
 * Something to point out: a phone or date that couldn't be read, a date given only as a
 * month (stored as the 1st), or Meta's test lead.
 */
export type LeadAnswerFlag = "phone_unclear" | "date_unclear" | "month_only" | "test";

/** One question's answer as the form sent it (Meta's `field_data`: `name` is the key). */
export interface LeadAnswerField {
  key: string;
  label?: string | null;
  values: string[];
}

export interface LeadAnswer {
  key: string;
  label: string;
  /** Word for word; several answers joined with ", " */
  value: string;
  usedFor: LeadAnswerUse | null;
}

export interface ReadLeadAnswersInput {
  fields: LeadAnswerField[];
  /** The form's questions, for their labels */
  questions?: { key: string; label: string }[] | null;
  /** The business's local date, YYYY-MM-DD: "Feb 14" means the next 14 Feb from here */
  today: string;
}

export interface LeadAnswers {
  name: string | null;
  /** E.164, e.g. +919876543210 */
  phone: string | null;
  email: string | null;
  city: string | null;
  venue: string | null;
  eventType: LeadAnswerEventType | null;
  /** YYYY-MM-DD; the 1st of the month when only a month was given */
  eventDate: string | null;
  guestCount: number | null;
  /** Rupees; the lower end of a range */
  budget: number | null;
  /** "Label: value" lines for everything not used above, at most 2,000 characters */
  requirements: string | null;
  answers: LeadAnswer[];
  flags: LeadAnswerFlag[];
}

export const REQUIREMENTS_MAX = 2000;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** Lower case, with anything that isn't a letter or digit turned into a single space. */
const words = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();

/** A whole-word match for any of the alternatives (Devanagari included). */
const W = (alternatives: string) => new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{M}\\p{N}])`, "u");

/** "when_is_the_wedding?" -> "When is the wedding?" */
function humanise(key: string): string {
  const s = key.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : key;
}

/** Meta sends some choices as `december_2026`: read them as `december 2026`. Emails and links stay. */
function readable(v: string): string {
  const s = v.trim();
  const out = /_/.test(s) && !/\s/.test(s) && !/[@/]/.test(s) ? s.replace(/_+/g, " ") : s;
  return out.replace(/\s+/g, " ").trim();
}

/** "priya sharma" or "PRIYA SHARMA" -> "Priya Sharma"; mixed case is left as typed. */
function tidyCase(s: string): string {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters || (letters !== letters.toLowerCase() && letters !== letters.toUpperCase())) return s;
  return s.toLowerCase().replace(/(^|[\s\-'.])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);

const TEST_VALUE = /^<\s*test lead/i;
/** Answers that say nothing: "no", "not decided yet", "-" */
const NON_ANSWER = /^(?:yes|no|haa?n|ji|nahi|nahin|na|n\/?a|nil|none|nope|tbd|tbc|not (?:yet|sure|decided|fixed|final|booked)(?: yet)?|undecided|abhi nahi|pata nahi|-+|\.+|\?+)$/i;

// ---------------------------------------------------------------------------
// Which field a question fills
// ---------------------------------------------------------------------------

/** Meta's standard question keys. Null: a standard question that isn't an enquiry field. */
const STANDARD_KEYS: Record<string, LeadAnswerUse | "first_name" | "last_name" | null> = {
  full_name: "name",
  name: "name",
  first_name: "first_name",
  last_name: "last_name",
  phone_number: "phone",
  phone: "phone",
  mobile_number: "phone",
  whatsapp_number: "phone",
  work_phone_number: "phone",
  email: "email",
  work_email: "email",
  city: "city",
  state: null,
  province: null,
  country: null,
  zip_code: null,
  post_code: null,
  street_address: null,
  date_of_birth: null,
  dob: null,
  gender: null,
  marital_status: null,
  relationship_status: null,
  military_status: null,
  job_title: null,
  company_name: null,
};

/** A wedding or function is what the question is about. */
const EVENT_WORD = W(
  "weddings?|shaa?di|vivaa?h|marriage|functions?|events?|engagement|roka|sagaa?i|reception|ceremony|party|celebration|occasion|शादी|विवाह|समारोह",
);
const SKIP = W("birth|dob|zip|pin ?code|pincode|postal|gender|company|occupation|profession|job|designation|age");
const DATE = W("date|dates|tareekh|tarikh|tareek|tithi|month|mahina|mahine|तारीख|तारीख़|तिथि|महीना");
const WHEN = W("when|kab");
const NOT_EVENT_TIME = W("call|calling|contact|reach|visit|meeting|appointment|baat");
const GUESTS = W("guests?|pax|people|persons?|log|mehm(?:a|aa)n|headcount|head count|attendees|crowd|मेहमान|लोग");
const BUDGET = W("budget|bajat|kharcha?|spend|spending|price|pricing|cost|amount|investment|बजट|खर्च");
const EMAIL = W("e ?mail|email id|mail id|gmail|ईमेल");
const PHONE = W("phone|mobile|whats ?app|cell|फोन|फ़ोन|मोबाइल|व्हाट्सएप");
const PHONE_NUMBER = W("contact|(?:mob|mobile|ph|phone|cell|whatsapp|contact) no|number");
/** "Best time to call on WhatsApp", "Contact person name": not the number itself */
const NOT_PHONE = W("time|when|kab|samay|name|naam");
/** "Number of functions" */
const NOT_A_NUMBER = W("of|how many|kitne|kitni");
const NAME = W("name|naam|नाम");
const COUPLE = W("bride|groom|dulhan|dulha|couple|boy|girl|ladka|ladki");
const NOT_NAME = W("venue|hotel|company|business|brand|page|form|event|function|father|mother|planner|photographer|vendor");
const VENUE = W("venues?|hotel|hotels|banquet|lawns?|resort|farm ?house|palace|mandap|hall|garden|property");
const CITY = W("city|location|shehar|sheher|shahar|shehr|town|place|jagah|destination|area|शहर|स्थान|जगह");
const WHERE = W("where|kahan|kahaan|kaha");
const NOT_CITY = W("hear|find|found|know|source|refer|referred|from where");
const EVENT_TYPE = W(
  "functions?|events?|occasion|ceremony|ceremonies|celebration|celebrating|planning|program|programme|karyakram|type|kaunsa|kaun sa|which|समारोह|कार्यक्रम",
);

type Use = LeadAnswerUse | "first_name" | "last_name" | "couple_name";

/** What a question asks for, from its key and label. Null: it goes into the requirements. */
function classify(key: string, label: string): { use: Use | null; standard: boolean } {
  const k = key.trim().toLowerCase();
  if (k in STANDARD_KEYS) return { use: STANDARD_KEYS[k] ?? null, standard: true };
  const t = words(`${key} ${label}`);
  if (SKIP.test(t)) return { use: null, standard: false };
  const use = ((): Use | null => {
    if ((DATE.test(t) || (WHEN.test(t) && EVENT_WORD.test(t))) && !NOT_EVENT_TIME.test(t)) return "eventDate";
    if (GUESTS.test(t) && !NAME.test(t)) return "guestCount";
    if (BUDGET.test(t)) return "budget";
    if (EMAIL.test(t)) return "email";
    if ((PHONE.test(t) || (PHONE_NUMBER.test(t) && !NOT_A_NUMBER.test(t))) && !NOT_PHONE.test(t)) return "phone";
    if (NAME.test(t) && COUPLE.test(t)) return "couple_name";
    if (NAME.test(t) && !NOT_NAME.test(t)) return "name";
    if (VENUE.test(t)) return "venue";
    if ((CITY.test(t) || (WHERE.test(t) && EVENT_WORD.test(t))) && !NOT_CITY.test(t)) return "city";
    if (EVENT_TYPE.test(t)) return "eventType";
    return null;
  })();
  return { use, standard: false };
}

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

/** Words for each function, in English and Hinglish. Pre-wedding before wedding, so it isn't read twice. */
const EVENT_SYNONYMS: [LeadAnswerEventType, string][] = [
  ["pre_wedding", "pre ?wedding|pre ?wed shoot|couple shoot"],
  ["baby_shower", "baby shower|godh ?bharai|godbharai|seemantham|valaikappu"],
  ["engagement", "engagements?|roka|rokka|sagaa?i|mangni|ring ceremony|tilak|सगाई"],
  ["haldi", "haldi|pithi|ubtan|mayun|mayon|हल्दी"],
  ["mehendi", "mehendi|mehndi|mehandi|mehendhi|mehndhi|mendhi|mehedi|henna|मेहंदी|मेहन्दी"],
  ["sangeet", "sangeet|sangit|garba|dandiya|संगीत"],
  ["reception", "receptions?|walima|valima"],
  ["wedding", "weddings?|shaa?di|shaa?dis|vivaa?h|marriages?|biyaa?h|byaa?h|nikaa?h|lagan|lagna|phere|pheras|anand karaj|bridal|bride|शादी|विवाह"],
  ["birthday", "birthdays?|b day|bday|janam ?din|janmdin"],
  ["anniversary", "anniversary|anniversaries|saa?lgirah"],
  ["corporate", "corporate|office|conference|offsite|company event|product launch|annual day"],
  ["other", "other|others"],
];
const EVENT_PATTERNS = EVENT_SYNONYMS.map(([type, alternatives]) => [type, new RegExp(W(alternatives).source, "gu")] as const);

/** Words that only join functions together: "Haldi and Shaadi function". */
const JOINERS = new RegExp(
  W("and|or|with|plus|aur|ya|ka|ki|ke|hai|function|functions|ceremony|ceremonies|event|events|party|day|night|only|all|both|full|etc|the|a|of|for|my|our").source,
  "gu",
);

function scanEvents(text: string): { types: LeadAnswerEventType[]; rest: string } {
  let t = ` ${words(text)} `;
  const found: { type: LeadAnswerEventType; at: number }[] = [];
  for (const [type, re] of EVENT_PATTERNS) {
    let at = -1;
    t = t.replace(re, (m: string, offset: number) => {
      if (at < 0) at = offset;
      return " ".repeat(m.length);
    });
    if (at >= 0) found.push({ type, at });
  }
  const types = found.sort((a, b) => a.at - b.at).map((f) => f.type);
  return { types, rest: t.replace(JOINERS, " ").replace(/\s+/g, " ").trim() };
}

/** Every function named in the text, in the order they appear: "Haldi, Mehndi, Shaadi" -> haldi, mehendi, wedding. */
export function eventTypesIn(text: string): LeadAnswerEventType[] {
  return scanEvents(text).types;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH_NAMES: [number, string][] = [
  [1, "jan|janu?ary|janvari|janwari"],
  [2, "feb|febr?u?ary|farvari|farwari"],
  [3, "mar|march"],
  [4, "apr|april|aprail"],
  [5, "may"],
  [6, "jun|june|joon"],
  [7, "jul|july|julai"],
  [8, "aug|august|agast"],
  [9, "sep|sept|september|sitambar|sitmbar"],
  [10, "oct|october|aktubar|aktoobar"],
  [11, "nov|november|navambar|navmbar"],
  [12, "dec|december|disambar|dismbar"],
];
const MONTH_RES = MONTH_NAMES.map(([m, alternatives]) => [m, new RegExp(`^(?:${alternatives})$`)] as const);

function monthOf(word: string): number | null {
  for (const [m, re] of MONTH_RES) if (re.test(word)) return m;
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

function isoDate(y: number, m: number, d: number): string | null {
  if (![y, m, d].every(Number.isInteger) || y < 2000 || y > 2099 || m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d > days ? null : `${y}-${pad(m)}-${pad(d)}`;
}

/** The next time this day and month comes round, counting today. */
function nextDate(m: number, d: number, today: string): string | null {
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  const year = m > tm || (m === tm && d >= td) ? ty : ty + 1;
  return isoDate(year, m, d);
}

/** The next time this month comes round, counting this month. */
function nextMonth(m: number, today: string): number {
  const [ty, tm] = today.split("-").map(Number) as [number, number];
  return m >= tm ? ty : ty + 1;
}

const FILLER = W("around|approx|approximately|tentative|tentatively|expected|maybe|probably|likely|about|in|on|by|the|of|date|is|month|mahina|wedding|shaadi|shadi");

/**
 * An event date as people type it in India: day first (14/12/2026), "14 Dec 2026",
 * "Dec 14" (the next one), or just a month ("Dec 2026", the 1st). Null when it can't be read.
 */
export function readEventDate(text: string, today: string): { date: string; monthOnly: boolean } | null {
  let s = readable(text)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/(\d+)\s*(?:st|nd|rd|th)\b/g, "$1")
    .replace(/[,:;]/g, " ");
  s = s
    .replace(new RegExp(FILLER.source, "gu"), " ")
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (!s) return null;
  let m: RegExpExecArray | null;

  // 2026-12-14, or a full timestamp
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ].*)?$/.exec(s))) {
    const date = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? { date, monthOnly: false } : null;
  }
  // 2026/12/14
  if ((m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s))) {
    const date = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? { date, monthOnly: false } : null;
  }
  // 14/12/2026, 14-12-26: day first; 12/25/2026 only when it can't be day first
  if ((m = /^(\d{1,2})\s*[/\-. ]\s*(\d{1,2})\s*[/\-. ]\s*(\d{4}|\d{2})$/.exec(s))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = fullYear(m[3]!);
    const date = isoDate(y, b, a) ?? (b > 12 ? isoDate(y, a, b) : null);
    return date ? { date, monthOnly: false } : null;
  }
  // 12/2026, 2026-12: a month
  if ((m = /^(\d{1,2})[/\-.](\d{4})$/.exec(s)) || (m = /^(\d{4})[/\-.](\d{1,2})$/.exec(s))) {
    const [y, mo] = m[1]!.length === 4 ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])];
    const date = isoDate(y, mo, 1);
    return date ? { date, monthOnly: true } : null;
  }
  // 14 Dec 2026, 14-16 Dec 2026, 14 December, 14-dec-26
  if ((m = /^(\d{1,2})(?:\s*(?:-|–|to|&|and)\s*\d{1,2})?\s*[\s\-/.]\s*([a-z]+)\.?(?:\s*[\s\-/.']\s*(\d{4}|\d{2}))?$/.exec(s))) {
    const mo = monthOf(m[2]!);
    if (!mo) return null;
    const d = Number(m[1]);
    const date = m[3] ? isoDate(fullYear(m[3]), mo, d) : nextDate(mo, d, today);
    return date ? { date, monthOnly: false } : null;
  }
  // Dec 2026, December'26: a month
  if ((m = /^([a-z]+)\.?\s*(?:[\s\-/.]\s*(\d{4})|'\s*(\d{2}))$/.exec(s))) {
    const mo = monthOf(m[1]!);
    if (!mo) return null;
    const date = isoDate(fullYear(m[2] ?? m[3]!), mo, 1);
    return date ? { date, monthOnly: true } : null;
  }
  // Dec 14, December 14 2026, Dec 14-16
  if ((m = /^([a-z]+)\.?\s*[\s\-/.]?\s*(\d{1,2})(?:\s*(?:-|–|to|&|and)\s*\d{1,2})?(?:\s*[\s\-/.]\s*(\d{4}))?$/.exec(s))) {
    const mo = monthOf(m[1]!);
    if (!mo) return null;
    const d = Number(m[2]);
    const date = m[3] ? isoDate(Number(m[3]), mo, d) : nextDate(mo, d, today);
    return date ? { date, monthOnly: false } : null;
  }
  // December: the next one
  if ((m = /^([a-z]+)\.?$/.exec(s))) {
    const mo = monthOf(m[1]!);
    if (!mo) return null;
    const date = isoDate(nextMonth(mo, today), mo, 1);
    return date ? { date, monthOnly: true } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Amounts and counts
// ---------------------------------------------------------------------------

const UNITS: [number, RegExp][] = [
  [10_000_000, /^(?:crores?|cr|crs|cro)$/],
  [100_000, /^(?:lakhs?|lacs?|lakh|lkh|lk|l)$/],
  [1_000_000, /^(?:millions?|mn)$/],
  [1_000, /^(?:k|thousands?|hazaa?r|hajaa?r)$/],
];
const unitOf = (word: string | undefined) => (word ? (UNITS.find(([, re]) => re.test(word))?.[0] ?? null) : null);

const NUMBER_WITH_UNIT = /(\d+(?:\.\d+)?)\s*([a-z]+)?/g;

/** The numbers in a text with their unit (lakh, crore, k), ignoring words that aren't units. */
function numbersIn(text: string): { n: number; unit: number | null }[] {
  const s = readable(text)
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/₹|\brs\b\.?|\binr\b|\brupees?\b|\/-/g, " ");
  const out: { n: number; unit: number | null }[] = [];
  for (const m of s.matchAll(NUMBER_WITH_UNIT)) out.push({ n: Number(m[1]), unit: unitOf(m[2]) });
  return out;
}

/** Just a number, maybe with ₹ and commas: nothing lost by storing it as one. */
const isBareNumber = (text: string) => /^\s*(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d+)?\s*(?:\/-)?\s*$/i.test(text);

/**
 * A budget in rupees: "5-10 lakh" -> 5,00,000, "₹8L", "1.5 cr", "50k", "2,50,000". The lower
 * end of a range. `labelUnit` is a unit named in the question, e.g. "Budget (in lakhs)".
 */
export function readBudget(text: string, labelUnit: number | null = null): number | null {
  const nums = numbersIn(text).filter((x) => x.n > 0);
  if (!nums.length) return null;
  const first = nums[0]!;
  // "5-10 lakh": the unit after the range counts for its first number too.
  const unit = first.unit ?? (first.n < 1000 ? (nums.find((x) => x.unit)?.unit ?? labelUnit) : null) ?? 1;
  const value = Math.round(first.n * unit);
  return value >= 1000 && value <= 1_000_000_000 ? value : null;
}

/** A head count: "200-300" -> 200, "500+" -> 500, "1.5k" -> 1500. */
export function readGuestCount(text: string): number | null {
  const nums = numbersIn(text).filter((x) => x.n > 0);
  if (!nums.length) return null;
  const first = nums[0]!;
  const value = Math.round(first.n * (first.unit === 1000 ? 1000 : 1));
  return value >= 1 && value <= 100_000 ? value : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// The whole form
// ---------------------------------------------------------------------------

/** "instagram_ad" for Instagram (`ig`), otherwise "facebook_ad". */
export function sourceForPlatform(platform: string | null | undefined): "instagram_ad" | "facebook_ad" {
  return adPlatform(platform) === "instagram" ? "instagram_ad" : "facebook_ad";
}

/** Meta's `platform` (fb, ig) as a word; null when Meta didn't say. */
export function adPlatform(platform: string | null | undefined): "facebook" | "instagram" | null {
  const p = (platform ?? "").trim().toLowerCase();
  if (!p) return null;
  return p === "ig" || p === "instagram" ? "instagram" : "facebook";
}

interface Item {
  key: string;
  label: string;
  value: string;
  use: Use | null;
  standard: boolean;
  test: boolean;
  usedFor: LeadAnswerUse | null;
  /** The line for the requirements, when it goes there */
  line: string | null;
}

const empty = (answers: LeadAnswer[], requirements: string | null): LeadAnswers => ({
  name: null,
  phone: null,
  email: null,
  city: null,
  venue: null,
  eventType: null,
  eventDate: null,
  guestCount: null,
  budget: null,
  requirements,
  answers,
  flags: [],
});

function capRequirements(lines: string[]): string | null {
  const text = lines.filter(Boolean).join("\n").trim();
  if (!text) return null;
  return text.length > REQUIREMENTS_MAX ? `${text.slice(0, REQUIREMENTS_MAX - 1).trimEnd()}…` : text;
}

/** Reads a lead form's answers into enquiry fields. Never throws. */
export function readLeadAnswers(input: ReadLeadAnswersInput): LeadAnswers {
  const items: Item[] = [];
  try {
    const labels = new Map((input.questions ?? []).map((q) => [q.key, q.label]));
    for (const f of input.fields ?? []) {
      const key = String(f?.key ?? "").trim();
      const value = (Array.isArray(f?.values) ? f.values : [])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .join(", ");
      if (!key || !value) continue;
      const label = String(f?.label || labels.get(key) || humanise(key)).trim();
      const { use, standard } = classify(key, label);
      const test = TEST_VALUE.test(value);
      items.push({ key, label, value, use: test ? null : use, standard, test, usedFor: null, line: test ? null : `${label}: ${readable(value)}` });
    }
    const today = /^\d{4}-\d{2}-\d{2}$/.test(input.today ?? "") ? input.today : new Date().toISOString().slice(0, 10);
    return read(items, today);
  } catch {
    // Something unexpected in the answers: keep every one of them, word for word.
    const answers = items.map((i) => ({ key: i.key, label: i.label, value: i.value, usedFor: null }));
    return empty(answers, capRequirements(items.map((i) => (i.test ? "" : `${i.label}: ${i.value}`))));
  }
}

function read(items: Item[], today: string): LeadAnswers {
  const out = empty([], null);
  const flags = new Set<LeadAnswerFlag>();
  if (items.some((i) => i.test)) flags.add("test");

  // Standard keys first, then the rest in form order.
  const candidates = (use: Use) => [...items.filter((i) => i.use === use && i.standard), ...items.filter((i) => i.use === use && !i.standard)];
  const take = (i: Item, usedFor: LeadAnswerUse, keepLine = false) => {
    i.usedFor = usedFor;
    if (!keepLine) i.line = null;
  };

  // Name: the full name, or first and last.
  for (const i of candidates("name")) {
    const v = cap(tidyCase(readable(i.value)), 80);
    if (v.length < 2) continue;
    out.name = v;
    take(i, "name");
    break;
  }
  if (!out.name) {
    const first = candidates("first_name")[0];
    const last = candidates("last_name")[0];
    const v = cap(tidyCase([first?.value, last?.value].filter(Boolean).map((x) => readable(x!)).join(" ")), 80);
    if (v.length >= 2) {
      out.name = v;
      if (first) take(first, "name");
      if (last) take(last, "name");
    }
  }
  if (!out.name) {
    // Only the bride's or groom's name was asked.
    const couple = candidates("couple_name")[0];
    if (couple) {
      out.name = cap(tidyCase(readable(couple.value)), 80);
      take(couple, "name");
    }
  }
  if (!out.name && flags.has("test")) out.name = "Test lead";

  // Phone: the first that reads as a number; the same number again is used too.
  const phones = candidates("phone");
  for (const i of phones) {
    const v = normalizePhone(i.value.replace(/^\s*p\s*:\s*/i, "").replace(/\s+/g, ""));
    if (!v) continue;
    if (!out.phone) out.phone = v;
    if (v === out.phone) take(i, "phone");
  }
  if (!out.phone && phones.length) flags.add("phone_unclear");

  for (const i of candidates("email")) {
    const v = i.value.trim().toLowerCase();
    if (v.length > 254 || !EMAIL_RE.test(v)) continue;
    out.email = v;
    take(i, "email");
    break;
  }

  // Venue first (a hotel, banquet or lawn), then the city.
  for (const i of candidates("venue")) {
    const v = readable(i.value);
    if (NON_ANSWER.test(v)) continue;
    out.venue = cap(tidyCase(v), 120);
    take(i, "venue");
    break;
  }
  for (const i of candidates("city")) {
    const v = readable(i.value);
    if (NON_ANSWER.test(v)) continue;
    out.city = cap(tidyCase(v), 60);
    take(i, "city");
    break;
  }

  const dates = candidates("eventDate");
  for (const i of dates) {
    const d = readEventDate(i.value, today);
    if (!d) continue;
    out.eventDate = d.date;
    if (d.monthOnly) flags.add("month_only");
    // A month alone keeps its words, so nobody takes the 1st for the real day.
    take(i, "eventDate", d.monthOnly);
    break;
  }
  if (!out.eventDate && dates.length) flags.add("date_unclear");

  for (const i of candidates("guestCount")) {
    const v = readGuestCount(i.value);
    if (v === null) continue;
    out.guestCount = v;
    take(i, "guestCount", !isBareNumber(i.value));
    break;
  }

  for (const i of candidates("budget")) {
    const v = readBudget(i.value, unitOf(/(lakhs?|lacs?|crores?|thousands?)/i.exec(i.label)?.[1]?.toLowerCase()));
    if (v === null) continue;
    out.budget = v;
    take(i, "budget", !isBareNumber(i.value));
    break;
  }

  // Functions: wedding when it's one of them, plus a "Functions: …" line when there are several.
  const named: { types: LeadAnswerEventType[]; rest: string; i: Item }[] = [];
  for (const i of candidates("eventType")) {
    const scan = scanEvents(i.value);
    if (scan.types.length) named.push({ ...scan, i });
  }
  const types = [...new Set(named.flatMap((n) => n.types))];
  if (types.length) {
    out.eventType = types.includes("wedding") ? "wedding" : types[0]!;
    named.forEach((n, idx) => {
      // "Wedding photography" keeps its words; "Shaadi" alone says nothing more.
      take(n.i, "eventType", !!n.rest);
      if (types.length > 1) n.i.line = idx === 0 ? `Functions: ${named.map((x) => readable(x.i.value)).join(", ")}` : null;
    });
  } else {
    // "Wedding date", "Shaadi ka venue": the question itself says what it's for.
    const about: (Use | null)[] = ["eventDate", "venue", "city", "guestCount", "budget"];
    const implied = new Set(items.filter((i) => about.includes(i.use)).flatMap((i) => eventTypesIn(i.label)));
    if (implied.size === 1) out.eventType = [...implied][0]!;
  }

  out.answers = items.map((i) => ({ key: i.key, label: i.label, value: i.value, usedFor: i.usedFor }));
  out.requirements = capRequirements(items.map((i) => i.line ?? ""));
  out.flags = [...flags];
  return out;
}
