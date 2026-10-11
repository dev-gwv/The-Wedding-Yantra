import { describe, expect, it } from "vitest";
import {
  adPlatform,
  eventTypesIn,
  leadSourceAlertText,
  metaAdminMessage,
  metaProblem,
  metaProblemTone,
  metaTestToolSteps,
  META_PROBLEM_KINDS,
  readBudget,
  readEventDate,
  readGuestCount,
  readLeadAnswers,
  REQUIREMENTS_MAX,
  sourceForPlatform,
  groupOf,
  activityText,
  type LeadAnswerField,
} from "./index.js";

const TODAY = "2026-10-11";
const f = (key: string, value: string | string[], label?: string): LeadAnswerField => ({
  key,
  label,
  values: Array.isArray(value) ? value : [value],
});
const read = (fields: LeadAnswerField[], questions?: { key: string; label: string }[]) => readLeadAnswers({ fields, questions, today: TODAY });

describe("readLeadAnswers: standard keys", () => {
  it("reads Meta's standard questions", () => {
    const r = read([
      f("full_name", "Priya Sharma"),
      f("phone_number", "+919876543210"),
      f("email", "Priya.Sharma@Example.com"),
      f("city", "Jaipur"),
    ]);
    expect(r).toMatchObject({ name: "Priya Sharma", phone: "+919876543210", email: "priya.sharma@example.com", city: "Jaipur" });
    expect(r.requirements).toBeNull();
    expect(r.flags).toEqual([]);
    expect(r.answers.map((a) => a.usedFor)).toEqual(["name", "phone", "email", "city"]);
  });

  it("joins first and last name, and tidies all-lower-case names", () => {
    const r = read([f("first_name", "priya"), f("last_name", "sharma"), f("phone_number", "9876543210")]);
    expect(r.name).toBe("Priya Sharma");
    expect(r.answers.filter((a) => a.usedFor === "name")).toHaveLength(2);
  });

  it("strips p: and spaces from the phone and normalises it", () => {
    expect(read([f("phone_number", "p:+91 98765 43210")]).phone).toBe("+919876543210");
    expect(read([f("phone_number", "098765 43210")]).phone).toBe("+919876543210");
    expect(read([f("phone_number", "919876543210")]).phone).toBe("+919876543210");
  });

  it("flags a phone it can't read, and keeps it in the requirements", () => {
    const r = read([f("full_name", "Priya"), f("phone_number", "12345")]);
    expect(r.phone).toBeNull();
    expect(r.flags).toContain("phone_unclear");
    expect(r.requirements).toBe("Phone number: 12345");
    expect(r.answers[1]!.usedFor).toBeNull();
  });

  it("takes a WhatsApp number when there's no phone, and keeps a second different number", () => {
    const r = read([f("whatsapp_no", "98765 43210", "WhatsApp no."), f("alt", "9123456780", "Alternate mobile number")]);
    expect(r.phone).toBe("+919876543210");
    expect(r.requirements).toBe("Alternate mobile number: 9123456780");
  });

  it("leaves standard questions that aren't enquiry fields in the requirements", () => {
    const r = read([f("full_name", "Priya"), f("date_of_birth", "14/02/1998", "Date of birth"), f("company_name", "Acme", "Company name")]);
    expect(r.eventDate).toBeNull();
    expect(r.flags).not.toContain("date_unclear");
    expect(r.requirements).toBe("Date of birth: 14/02/1998\nCompany name: Acme");
  });

  it("uses the form's question labels when the field has none", () => {
    const r = read([f("q1", "300")], [{ key: "q1", label: "How many guests?" }]);
    expect(r.guestCount).toBe(300);
    expect(r.answers[0]!.label).toBe("How many guests?");
  });

  it("drops a bad email instead of using it", () => {
    const r = read([f("email", "priya at gmail")]);
    expect(r.email).toBeNull();
    expect(r.requirements).toBe("Email: priya at gmail");
  });
});

describe("readLeadAnswers: Hinglish and custom questions", () => {
  it("reads Hinglish labels", () => {
    const r = read([
      f("aapka_naam", "Rohit Verma", "Aapka naam"),
      f("mobile", "9876543210", "Mobile number"),
      f("shaadi_ki_tareekh", "14/12/2026", "Shaadi ki tareekh"),
      f("shaadi_kahan_hai?", "Udaipur", "Shaadi kahan hai?"),
      f("kitne_mehmaan?", "200-300", "Kitne mehmaan aayenge?"),
      f("budget_kitna_hai?", "5-10 lakh", "Aapka budget kitna hai?"),
      f("kaunsa_function?", "Shaadi", "Kaunsa function hai?"),
    ]);
    expect(r).toMatchObject({
      name: "Rohit Verma",
      phone: "+919876543210",
      eventDate: "2026-12-14",
      city: "Udaipur",
      guestCount: 200,
      budget: 500000,
      eventType: "wedding",
    });
    expect(r.requirements).toBe("Kitne mehmaan aayenge?: 200-300\nAapka budget kitna hai?: 5-10 lakh");
  });

  it("reads Meta's snake-case keys when there are no labels", () => {
    const r = read([
      f("full_name", "Neha"),
      f("when_is_your_wedding?", "dec_2026"),
      f("wedding_venue", "Rambagh Palace"),
      f("number_of_guests", "500+"),
    ]);
    expect(r).toMatchObject({ eventDate: "2026-12-01", venue: "Rambagh Palace", guestCount: 500, eventType: "wedding" });
    expect(r.flags).toEqual(["month_only"]);
    expect(r.requirements).toBe("When is your wedding?: dec 2026\nNumber of guests: 500+");
  });

  it("reads Devanagari labels", () => {
    const r = read([f("q1", "सीमा", "आपका नाम"), f("q2", "9876543210", "फ़ोन"), f("q3", "जयपुर", "शहर")]);
    expect(r).toMatchObject({ name: "सीमा", phone: "+919876543210", city: "जयपुर" });
  });

  it("puts the venue before the city", () => {
    const r = read([f("q1", "Jaipur", "Event city"), f("q2", "Taj banquet", "Venue / hotel")]);
    expect(r.city).toBe("Jaipur");
    expect(r.venue).toBe("Taj banquet");
  });

  it("doesn't take 'not decided' for a venue", () => {
    const r = read([f("q1", "Not decided yet", "Venue booked?"), f("q2", "Jaipur", "City")]);
    expect(r.venue).toBeNull();
    expect(r.requirements).toBe("Venue booked?: Not decided yet");
  });

  it("asks nothing of questions it doesn't know: they go to the requirements", () => {
    const r = read([f("full_name", "Priya"), f("how_did_you_hear_about_us?", "instagram"), f("message", "Need candid photos too")]);
    expect(r.requirements).toBe("How did you hear about us?: instagram\nMessage: Need candid photos too");
  });

  it("doesn't read a best-time-to-call question as a date or a phone", () => {
    const r = read([f("q1", "Evening", "When can we call you?"), f("q2", "After 6 pm", "Best time to call on WhatsApp")]);
    expect(r.eventDate).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.flags).toEqual([]);
  });

  it("reads a contact person's name and a plain Contact question", () => {
    const r = read([f("q1", "Sunita Devi", "Contact person name"), f("q2", "9876543210", "Contact"), f("q3", "3", "Number of functions")]);
    expect(r).toMatchObject({ name: "Sunita Devi", phone: "+919876543210", guestCount: null });
    expect(r.requirements).toBe("Number of functions: 3");
  });

  it("reads a phone question that names whose number it is", () => {
    expect(read([f("q", "98765 43210", "Mobile number of the bride's father")]).phone).toBe("+919876543210");
  });

  it("reads where the wedding is as the city, not where they found us", () => {
    const r = read([f("q1", "Google", "Where did you find us?"), f("q2", "goa", "Where is the wedding?")]);
    expect(r.city).toBe("Goa");
    expect(r.eventType).toBe("wedding");
    expect(r.requirements).toBe("Where did you find us?: Google");
  });

  it("takes the bride's name when no other name was asked", () => {
    const r = read([f("q1", "Kavya", "Bride name"), f("q2", "Arjun", "Groom name")]);
    expect(r.name).toBe("Kavya");
    expect(r.requirements).toBe("Groom name: Arjun");
  });
});

describe("readLeadAnswers: dates", () => {
  it.each([
    ["14/12/2026", "2026-12-14"],
    ["14-12-26", "2026-12-14"],
    ["04.01.2027", "2027-01-04"],
    ["14 Feb 2027", "2027-02-14"],
    ["14th February, 2027", "2027-02-14"],
    ["14-16 Dec 2026", "2026-12-14"],
    ["2026-12-14", "2026-12-14"],
    ["2026-12-14T00:00:00+0000", "2026-12-14"],
    ["12/25/2026", "2026-12-25"],
    ["Wedding on 20 Nov 2026 (tentative)", "2026-11-20"],
  ])("reads %s day first", (text, date) => {
    expect(readEventDate(text, TODAY)).toEqual({ date, monthOnly: false });
  });

  it("takes the next one when there's no year", () => {
    expect(readEventDate("Feb 14", TODAY)).toEqual({ date: "2027-02-14", monthOnly: false });
    expect(readEventDate("14 Dec", TODAY)).toEqual({ date: "2026-12-14", monthOnly: false });
    expect(readEventDate("Oct 11", TODAY)).toEqual({ date: "2026-10-11", monthOnly: false });
    expect(readEventDate("Oct 10", TODAY)).toEqual({ date: "2027-10-10", monthOnly: false });
  });

  it.each([
    ["Dec 2026", "2026-12-01"],
    ["december_2026", "2026-12-01"],
    ["Dec'26", "2026-12-01"],
    ["12/2026", "2026-12-01"],
    ["around Feb 2027", "2027-02-01"],
    ["March", "2027-03-01"],
    ["November", "2026-11-01"],
  ])("reads %s as a month", (text, date) => {
    expect(readEventDate(text, TODAY)).toEqual({ date, monthOnly: true });
  });

  it.each(["not decided", "next year", "31/02/2026", "soon", "45/45/2026", "", "Sunday"])("can't read %j", (text) => {
    expect(readEventDate(text, TODAY)).toBeNull();
  });

  it("flags a month alone and keeps its words in the requirements", () => {
    const r = read([f("wedding_month", "Dec 2026", "Wedding month")]);
    expect(r.eventDate).toBe("2026-12-01");
    expect(r.flags).toEqual(["month_only"]);
    expect(r.requirements).toBe("Wedding month: Dec 2026");
    expect(r.answers[0]!.usedFor).toBe("eventDate");
  });

  it("flags a date it can't read and keeps it in the requirements", () => {
    const r = read([f("event_date", "after diwali", "Event date")]);
    expect(r.eventDate).toBeNull();
    expect(r.flags).toEqual(["date_unclear"]);
    expect(r.requirements).toBe("Event date: after diwali");
  });

  it("knows the function from the date question", () => {
    expect(read([f("q", "14/12/2026", "Wedding date")]).eventType).toBe("wedding");
    expect(read([f("q", "14/12/2026", "Roka date")]).eventType).toBe("engagement");
    expect(read([f("q", "14/12/2026", "Event date")]).eventType).toBeNull();
  });
});

describe("readLeadAnswers: guests and budget", () => {
  it.each([
    ["200-300", 200],
    ["200 to 300", 200],
    ["500+", 500],
    ["approx 300 people", 300],
    ["100_-_200", 100],
    ["1.5k", 1500],
    ["1,200", 1200],
  ])("guests %s -> %d", (text, n) => {
    expect(readGuestCount(text)).toBe(n);
  });

  it.each(["", "many", "0", "200000"])("no guest count from %j", (text) => {
    expect(readGuestCount(text)).toBeNull();
  });

  it.each([
    ["5-10 lakh", 500_000],
    ["5 to 10 lakhs", 500_000],
    ["₹8L", 800_000],
    ["₹5L-₹10L", 500_000],
    ["1.5 cr", 15_000_000],
    ["1 crore+", 10_000_000],
    ["50k", 50_000],
    ["50,000 - 1 lakh", 50_000],
    ["Rs. 2,50,000/-", 250_000],
    ["2.5 lacs", 250_000],
    ["Under 5 lakh", 500_000],
    ["5_lakh_-_10_lakh", 500_000],
    ["25 hazar", 25_000],
    ["15000 per day", 15_000],
    ["0-5 lakh", 500_000],
  ])("budget %s -> %d", (text, n) => {
    expect(readBudget(text)).toBe(n);
  });

  it.each(["", "flexible", "5", "₹0"])("no budget from %j", (text) => {
    expect(readBudget(text)).toBeNull();
  });

  it("uses a unit named in the question", () => {
    const r = read([f("budget", "8", "Budget (in lakhs)")]);
    expect(r.budget).toBe(800_000);
  });

  it("keeps the budget's own words, but not a plain number", () => {
    expect(read([f("budget", "5-10 lakh", "Budget")]).requirements).toBe("Budget: 5-10 lakh");
    expect(read([f("budget", "250000", "Budget")]).requirements).toBeNull();
    expect(read([f("guests", "300", "Guests")]).requirements).toBeNull();
  });
});

describe("readLeadAnswers: functions", () => {
  it.each([
    ["Shaadi", ["wedding"]],
    ["Roka", ["engagement"]],
    ["Sagai ceremony", ["engagement"]],
    ["Mehndi", ["mehendi"]],
    ["Pre-wedding shoot", ["pre_wedding"]],
    ["Haldi, Mehndi & Shaadi", ["haldi", "mehendi", "wedding"]],
    ["godh bharai", ["baby_shower"]],
    ["1st Birthday", ["birthday"]],
    ["Cocktail night", []],
  ])("%s", (text, types) => {
    expect(eventTypesIn(text)).toEqual(types);
  });

  it("picks the wedding from several, with a Functions line", () => {
    const r = read([f("functions", ["Haldi", "Mehndi", "Shaadi"], "Which functions?")]);
    expect(r.eventType).toBe("wedding");
    expect(r.requirements).toBe("Functions: Haldi, Mehndi, Shaadi");
  });

  it("takes the first when the wedding isn't one of them", () => {
    const r = read([f("functions", "sangeet_and_reception", "Functions")]);
    expect(r.eventType).toBe("sangeet");
    expect(r.requirements).toBe("Functions: sangeet and reception");
  });

  it("keeps the words of a function with more to say, and of one it doesn't know", () => {
    expect(read([f("q", "Wedding photography", "Event type")]).requirements).toBe("Event type: Wedding photography");
    expect(read([f("q", "Shaadi", "Event type")]).requirements).toBeNull();
    const r = read([f("q", "Naming ceremony", "Occasion")]);
    expect(r.eventType).toBeNull();
    expect(r.requirements).toBe("Occasion: Naming ceremony");
  });
});

describe("readLeadAnswers: test leads and limits", () => {
  it("labels Meta's test lead and doesn't flag its dummy data", () => {
    const r = read([
      f("full_name", "<test lead: dummy data for full_name>"),
      f("phone_number", "<test lead: dummy data for phone_number>"),
      f("email", "test@example.invalid"),
    ]);
    expect(r.flags).toEqual(["test"]);
    expect(r.name).toBe("Test lead");
    expect(r.phone).toBeNull();
    expect(r.requirements).toBeNull();
    expect(r.answers[0]!.value).toBe("<test lead: dummy data for full_name>");
  });

  it("caps the requirements at 2,000 characters", () => {
    const fields = Array.from({ length: 40 }, (_, i) => f(`q${i}`, "x".repeat(100), `Question ${i}`));
    const r = read(fields);
    expect(r.requirements!.length).toBe(REQUIREMENTS_MAX);
    expect(r.requirements!.endsWith("…")).toBe(true);
    expect(r.answers).toHaveLength(40);
  });

  it("skips empty answers and never throws", () => {
    expect(read([f("full_name", ""), f("city", ["", " "])]).answers).toEqual([]);
    const bad = readLeadAnswers({ fields: [null, { key: "x" }, { key: 5, values: [7] }] as never, today: "nonsense" });
    expect(bad.answers).toEqual([{ key: "5", label: "5", value: "7", usedFor: null }]);
    expect(readLeadAnswers({} as never).answers).toEqual([]);
  });

  it("keeps every answer word for word", () => {
    const r = read([f("q", ["Haldi", "Mehendi"], "Functions"), f("full_name", "PRIYA SHARMA")]);
    expect(r.answers).toEqual([
      { key: "q", label: "Functions", value: "Haldi, Mehendi", usedFor: "eventType" },
      { key: "full_name", label: "Full name", value: "PRIYA SHARMA", usedFor: "name" },
    ]);
    expect(r.name).toBe("Priya Sharma");
  });
});

describe("ad platform and source", () => {
  it("Instagram for ig, Facebook otherwise", () => {
    expect(sourceForPlatform("ig")).toBe("instagram_ad");
    expect(sourceForPlatform("Instagram")).toBe("instagram_ad");
    expect(sourceForPlatform("fb")).toBe("facebook_ad");
    expect(sourceForPlatform(null)).toBe("facebook_ad");
    expect(adPlatform("ig")).toBe("instagram");
    expect(adPlatform("fb")).toBe("facebook");
    expect(adPlatform("")).toBeNull();
  });
});

describe("Facebook lead problems", () => {
  it("every problem has a title and steps", () => {
    for (const kind of META_PROBLEM_KINDS) {
      const p = metaProblem(kind, { pageName: "Riya Studio", who: "Riya", by: "2026-12-02", count: 3, days: 4 });
      expect(p.title.length).toBeGreaterThan(5);
      expect(p.steps.length).toBeGreaterThan(0);
    }
  });

  it("gives the Leads Access steps in order", () => {
    const p = metaProblem("lead_access", { pageName: "Riya Studio", who: "Riya Mehta" });
    expect(p.steps).toEqual([
      "On a computer, open business.facebook.com and go to Settings.",
      "Open Integrations, then Leads access.",
      "Choose the Page “Riya Studio”.",
      "Open CRMs, tap Assign CRMs, pick Wedding Yantra and tap Assign.",
      "Then open People and make sure Riya Mehta is listed. If not, add them.",
      "Come back here and tap Check again.",
    ]);
    expect(metaProblemTone("lead_access")).toBe("red");
    expect(metaProblemTone("reconnect_soon")).toBe("amber");
  });

  it("names the day to log in again by", () => {
    expect(metaProblem("reconnect_soon", { by: "2026-12-02" }).title).toBe("Log in to Facebook again by 2 Dec");
  });

  it("writes the steps for a Facebook admin, without the in-app step", () => {
    const text = metaAdminMessage("lead_access", { pageName: "Riya Studio", who: "Riya" })!;
    expect(text).toContain("*Please help: Facebook leads for “Riya Studio”*");
    expect(text).toContain("4. Open CRMs, tap Assign CRMs, pick Wedding Yantra and tap Assign.");
    expect(text).not.toContain("Check again");
    expect(metaAdminMessage("needs_reconnect")).toBeNull();
  });

  it("lists the testing tool steps", () => {
    expect(metaTestToolSteps({ pageName: "Riya Studio", formName: "Winter form" })).toHaveLength(3);
  });

  it("alerts always arrive and read plainly", () => {
    expect(groupOf("lead.source_problem")).toBeNull();
    expect(leadSourceAlertText({ what: "lead_access", pageName: "Riya Studio" }).title).toBe("Facebook leads stopped: Riya Studio");
    expect(leadSourceAlertText({ what: "failed_leads", count: 3, pageName: "Riya Studio" }).title).toBe("Couldn't bring in 3 Facebook leads");
    expect(leadSourceAlertText({ what: "recovered", count: 1 }).body).toBe("From your Page. Facebook didn't send it straight away; it's in Leads now.");
    expect(leadSourceAlertText({ what: "reconnect_soon", by: "2026-12-02" }).title).toBe("Log in to Facebook again by 2 Dec");
    expect(leadSourceAlertText({ what: "taken_over", pageName: "Riya Studio" }).title).toBe("Riya Studio now sends leads to another business");
  });

  it("describes Facebook activity", () => {
    const base = { actorName: "Riya", subject: null, other: null, amount: null, detail: null };
    expect(activityText({ ...base, action: "meta.connected", detail: "Riya Mehta" })).toBe("connected Facebook lead ads as Riya Mehta");
    expect(activityText({ ...base, action: "meta.disconnected" })).toBe("disconnected Facebook lead ads");
    expect(activityText({ ...base, action: "meta.page_on", subject: "Riya Studio" })).toBe("turned on leads from the Facebook Page Riya Studio");
    expect(activityText({ ...base, action: "meta.page_off", subject: "Riya Studio" })).toBe("turned off leads from the Facebook Page Riya Studio");
    expect(activityText({ ...base, action: "meta.page_taken_over", subject: "Riya Studio" })).toBe("moved the Facebook Page Riya Studio to this business");
    expect(activityText({ ...base, actorName: null, action: "meta.page_taken_over", subject: "Riya Studio" })).toBe(
      "The Facebook Page Riya Studio now sends its leads to another business",
    );
    expect(activityText({ ...base, action: "lead_routing.changed", detail: "Aman, Neha" })).toBe("changed who gets Facebook leads: Aman, Neha");
  });
});
