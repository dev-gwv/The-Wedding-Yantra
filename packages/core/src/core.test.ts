import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  BROADCAST_AUDIENCES,
  BROADCAST_PRESETS,
  broadcastProgress,
  can,
  canManageMember,
  formatDate,
  formatMoney,
  formatMoneyShort,
  formatPhone,
  localISODate,
  maskPhone,
  normalizePhone,
  whatsappLink,
} from "./index.js";

describe("normalizePhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["91 98765 43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+1 415 555 0100", "+14155550100"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "12345", "5876543210", "+91 12345 67890", "abc"])("rejects %s", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("phone display", () => {
  it("formats and masks Indian numbers", () => {
    expect(formatPhone("+919876543210")).toBe("+91 98765 43210");
    expect(maskPhone("+919876543210")).toBe("+91 ••••• •3210");
  });

  it("builds WhatsApp links", () => {
    expect(whatsappLink("Hi there", "+919876543210")).toBe("https://wa.me/919876543210?text=Hi%20there");
    expect(whatsappLink("Hi")).toBe("https://wa.me/?text=Hi");
  });
});

describe("money", () => {
  it("uses Indian grouping", () => {
    expect(formatMoney(120000)).toBe("₹1,20,000");
    expect(formatMoney(1234.5, { paise: true })).toBe("₹1,234.50");
  });

  it("shortens lakhs and crores", () => {
    expect(formatMoneyShort(120000)).toBe("₹1.2L");
    expect(formatMoneyShort(35000000)).toBe("₹3.5Cr");
    expect(formatMoneyShort(85000)).toBe("₹85K");
    expect(formatMoneyShort(-500)).toBe("-₹500");
  });
});

describe("formatDate", () => {
  it("gives local calendar dates, moved by whole days", () => {
    const lateNight = new Date(2026, 11, 31, 23, 50);
    expect(localISODate(lateNight)).toBe("2026-12-31");
    expect(localISODate(lateNight, 1)).toBe("2027-01-01");
    expect(localISODate(new Date(2026, 2, 1, 0, 5), -1)).toBe("2026-02-28");
  });

  it("formats calendar dates without time zone shifts", () => {
    expect(formatDate("2026-11-14")).toBe("14 Nov 2026");
    expect(formatDate("2026-01-01T00:30:00.000Z", { year: false })).toBe("1 Jan");
  });
});

describe("roles", () => {
  it("grants owners everything and freelancers nothing", () => {
    expect(can("owner", "billing.manage")).toBe(true);
    expect(can("manager", "billing.manage")).toBe(false);
    expect(can("freelancer", "members.view")).toBe(false);
  });

  it("never lets anyone create a second owner", () => {
    expect(assignableRoles("owner")).not.toContain("owner");
    expect(assignableRoles("manager")).toEqual(["staff", "freelancer", "accountant"]);
    expect(assignableRoles("staff")).toEqual([]);
  });

  it("protects the owner and stops managers managing managers", () => {
    expect(canManageMember("owner", "owner")).toBe(false);
    expect(canManageMember("owner", "manager")).toBe(true);
    expect(canManageMember("manager", "manager")).toBe(false);
    expect(canManageMember("manager", "staff")).toBe(true);
  });
});

import { eventScope, leadScope, renderTemplate } from "./index.js";

describe("events and tasks", () => {
  it("shows freelancers only the events they work on, and lets everyone but the accountant do tasks", () => {
    expect(eventScope("owner")).toBe("all");
    expect(eventScope("staff")).toBe("all");
    expect(eventScope("freelancer")).toBe("own");
    expect(eventScope("accountant")).toBe("all");
    expect(can("freelancer", "tasks.work")).toBe(true);
    expect(can("staff", "tasks.manage")).toBe(false);
    expect(can("manager", "tasks.manage")).toBe(true);
    expect(can("accountant", "tasks.work")).toBe(false);
  });
});

describe("leads", () => {
  it("shows staff only their own leads and freelancers none", () => {
    expect(leadScope("owner")).toBe("all");
    expect(leadScope("manager")).toBe("all");
    expect(leadScope("staff")).toBe("own");
    expect(leadScope("freelancer")).toBe("none");
    expect(leadScope("accountant")).toBe("none");
  });

  it("fills quick replies and never leaves raw placeholders", () => {
    const body = "Hi {first_name}, {business} is free on {event_date}. {my_name}";
    expect(renderTemplate(body, { name: "Neha Kapoor", business: "Riya Studio", eventDate: "2026-12-05", myName: "Riya" })).toBe(
      "Hi Neha, Riya Studio is free on 5 Dec 2026. Riya",
    );
    expect(renderTemplate(body, {})).toBe("Hi there, us is free on your event date. ");
  });
});

import { followUpPresets, formatFollowUp, timeAgo } from "./index.js";

describe("follow-up times", () => {
  const now = new Date(2026, 10, 12, 10, 30); // Thu 12 Nov 2026, 10:30 local
  it("reads like a person would say it", () => {
    expect(formatFollowUp(new Date(2026, 10, 12, 18, 0).toISOString(), now)).toBe("Today, 6 pm");
    expect(formatFollowUp(new Date(2026, 10, 13, 11, 30).toISOString(), now)).toBe("Tomorrow, 11:30 am");
    expect(formatFollowUp(new Date(2026, 10, 11, 9, 0).toISOString(), now)).toBe("Yesterday");
    expect(formatFollowUp(new Date(2026, 10, 20, 9, 0).toISOString(), now)).toBe("Fri 20 Nov");
    expect(formatFollowUp(new Date(2027, 0, 4, 9, 0).toISOString(), now)).toBe("Mon 4 Jan 2027");
  });
  it("offers this evening only before 5 pm", () => {
    expect(followUpPresets(now).map((p) => p.label)).toEqual(["This evening", "Tomorrow morning", "In 3 days", "Next week"]);
    expect(followUpPresets(new Date(2026, 10, 12, 19)).map((p) => p.label)[0]).toBe("Tomorrow morning");
  });
  it("says how long ago things happened", () => {
    expect(timeAgo(new Date(2026, 10, 12, 8, 30).toISOString(), now)).toBe("2 hours ago");
    expect(timeAgo(new Date(2026, 10, 9, 10, 0).toISOString(), now)).toBe("3 days ago");
  });
});

import { checklistDays, daysBetween, formatClock, formatDateRange, formatDueDay, todayIn } from "./index.js";

describe("due days and times", () => {
  it("counts calendar days, across months and years", () => {
    expect(daysBetween("2026-11-12", "2026-11-12")).toBe(0);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-11-12", "2026-11-09")).toBe(-3);
  });
  it("says when a task is due, next to today", () => {
    const today = "2026-11-12";
    expect(formatDueDay("2026-11-12", today)).toBe("Today");
    expect(formatDueDay("2026-11-13", today)).toBe("Tomorrow");
    expect(formatDueDay("2026-11-11", today)).toBe("Yesterday");
    expect(formatDueDay("2026-11-09", today)).toBe("3 days late");
    expect(formatDueDay("2026-11-20", today)).toBe("Fri 20 Nov");
    expect(formatDueDay("2027-01-04", today)).toBe("Mon 4 Jan 2027");
  });
  it("knows today in the business's time zone, whatever the device says", () => {
    const lateNightUtc = new Date("2026-09-25T18:54:00Z"); // already the 26th in India
    expect(todayIn("Asia/Kolkata", lateNightUtc)).toBe("2026-09-26");
    expect(todayIn("UTC", lateNightUtc)).toBe("2026-09-25");
    expect(todayIn("Asia/Kolkata", lateNightUtc, 6)).toBe("2026-10-02");
    expect(todayIn("Not/AZone", new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });
  it("spreads a trade's checklist over the days around the event", () => {
    const w = (...whens: ("before" | "on_day" | "after")[]) => checklistDays(whens.map((when) => ({ when })));
    expect(w("before", "before", "before", "on_day", "on_day", "after", "after")).toEqual([7, 4, 1, 0, 0, 1, 7]);
    expect(w("before", "on_day", "after", "after", "after", "after")).toEqual([3, 0, 1, 3, 5, 7]);
    expect(w("after", "before", "before", "before", "before", "before")).toEqual([2, 7, 6, 4, 3, 1]);
  });
  it("writes a span of days briefly", () => {
    expect(formatDateRange("2026-10-03", "2026-10-03")).toBe("3 Oct");
    expect(formatDateRange("2026-10-03", "2026-10-05")).toBe("3–5 Oct");
    expect(formatDateRange("2026-09-30", "2026-10-02")).toBe("30 Sep – 2 Oct");
    expect(formatDateRange("2026-12-30", "2027-01-02", "2026")).toBe("30 Dec – 2 Jan 2027");
    expect(formatDateRange("2027-01-04", "2027-01-06", "2026")).toBe("4–6 Jan 2027");
  });
  it("reads times the way people say them", () => {
    expect(formatClock("18:30")).toBe("6:30 pm");
    expect(formatClock("09:00")).toBe("9 am");
    expect(formatClock("00:15")).toBe("12:15 am");
    expect(formatClock("12:00")).toBe("12 pm");
    expect(formatClock("soon")).toBe("soon");
  });
});

import { computeQuoteTotals, quoteNumber } from "./index.js";

describe("quote totals", () => {
  it("adds lines, takes the discount before GST", () => {
    const t = computeQuoteTotals(
      [
        { quantity: 1, rate: 25000, taxRate: 18 },
        { quantity: 4, rate: 3500, taxRate: 18 },
        { quantity: 2, rate: 999.99, taxRate: 0 },
      ],
      3900,
    );
    expect(t.lineAmounts).toEqual([25000, 14000, 1999.98]);
    expect(t.subtotal).toBe(40999.98);
    expect(t.discount).toBe(3900);
    // GST is 18% of the taxable lines (39,000) after their share of the discount: 35,290.24
    expect(t.tax).toBe(6352.24);
    expect(t.total).toBe(43452.22);
  });

  it("never lets the discount go negative or above the subtotal", () => {
    expect(computeQuoteTotals([{ quantity: 1, rate: 100, taxRate: 0 }], 500).total).toBe(0);
    expect(computeQuoteTotals([{ quantity: 1, rate: 100, taxRate: 0 }], -5).discount).toBe(0);
    expect(computeQuoteTotals([], 0)).toEqual({ lineAmounts: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
  });

  it("numbers quotes", () => {
    expect(quoteNumber(7)).toBe("Q-0007");
    expect(quoteNumber(12345)).toBe("Q-12345");
  });
});

import {
  billMessage,
  billNumber,
  computeBillTotals,
  computeLines,
  financialYear,
  receiptMessage,
  rupeesInWords,
  stateFromGstin,
  stateName,
  upiLink,
} from "./index.js";

describe("bills", () => {
  const lines = [
    { quantity: 1, rate: 25000, taxRate: 18 },
    { quantity: 4, rate: 3500, taxRate: 18 },
    { quantity: 1, rate: 3000, taxRate: 5 },
  ];

  it("spreads the discount so the shares add up to the paisa", () => {
    const r = computeLines(lines, 2000);
    expect(r.lines.map((l) => l.discount)).toEqual([1190.48, 666.67, 142.85]);
    expect(r.lines.reduce((a, l) => a + l.discount, 0)).toBeCloseTo(2000, 10);
    expect(r.lines.map((l) => l.taxable)).toEqual([23809.52, 13333.33, 2857.15]);
  });

  it("splits GST into CGST and SGST inside the state, and rounds the total to the rupee", () => {
    const t = computeBillTotals(lines, 2000, { chargesGst: true, interState: false });
    expect(t.lines.map((l) => l.tax)).toEqual([4285.71, 2400, 142.86]);
    expect(t.lines[0]).toMatchObject({ cgst: 2142.86, sgst: 2142.85, igst: 0 });
    expect(t).toMatchObject({ subtotal: 42000, discount: 2000, taxable: 40000, tax: 6828.57, exactTotal: 46828.57, roundOff: 0.43, total: 46829 });
    expect(t.cgst + t.sgst).toBeCloseTo(t.tax, 10);
    expect(t.byRate).toEqual([
      { rate: 5, taxable: 2857.15, cgst: 71.43, sgst: 71.43, igst: 0 },
      { rate: 18, taxable: 37142.85, cgst: 3342.86, sgst: 3342.85, igst: 0 },
    ]);
  });

  it("charges IGST for another state and no GST without a GST number", () => {
    const igst = computeBillTotals(lines, 2000, { chargesGst: true, interState: true });
    expect(igst).toMatchObject({ cgst: 0, sgst: 0, igst: 6828.57, total: 46829 });
    const none = computeBillTotals(lines, 2000, { chargesGst: false, interState: false });
    expect(none).toMatchObject({ tax: 0, total: 40000, roundOff: 0, byRate: [] });
  });

  it("matches the quote maths, so a bill from a quote has the same numbers", () => {
    const q = computeQuoteTotals(lines, 2000);
    const b = computeBillTotals(lines, 2000, { chargesGst: true, interState: false });
    expect(b.tax).toBe(q.tax);
    expect(b.exactTotal).toBe(q.total);
  });

  it("numbers bills by financial year", () => {
    expect(financialYear("2026-03-31")).toBe("2025-26");
    expect(financialYear("2026-04-01")).toBe("2026-27");
    expect(financialYear("2099-12-31")).toBe("2099-00");
    expect(billNumber("INV", "2026-27", 7)).toBe("INV/26-27/0007");
    expect(billNumber("RIYA", "2026-27", 12).length).toBeLessThanOrEqual(16);
  });

  it("knows the state from a GST number", () => {
    expect(stateFromGstin("08ABCDE1234F1Z5")).toBe("08");
    expect(stateName("08")).toBe("Rajasthan");
    expect(stateFromGstin("99ABCDE1234F1Z5")).toBeNull();
    expect(stateFromGstin(null)).toBeNull();
  });

  it("builds UPI links any payment app understands", () => {
    expect(upiLink({ upiId: "riya@okhdfc", payee: "Riya Makeup Studio", amount: 20514, note: "INV/26-27/0001" })).toBe(
      "upi://pay?pa=riya@okhdfc&pn=Riya%20Makeup%20Studio&am=20514.00&cu=INR&tn=INV%2F26-27%2F0001",
    );
  });

  it("writes short, polite WhatsApp messages", () => {
    expect(
      billMessage({
        clientName: "Neha Kapoor",
        business: "Riya Makeup Studio",
        number: "INV/26-27/0001",
        total: 46829,
        due: 26829,
        dueDate: "2026-10-04",
        link: "https://x.in/b/abc",
        payOnline: true,
      }),
    ).toBe(
      "Hi Neha, here is your invoice INV/26-27/0001 from Riya Makeup Studio for ₹46,829. Balance due: ₹26,829 by 4 Oct. See it and pay by UPI here: https://x.in/b/abc",
    );
    expect(
      receiptMessage({ clientName: "Neha", business: "Riya Makeup Studio", amount: 20000, method: "UPI", paidOn: "2026-09-25", due: 0, link: null }),
    ).toBe("Hi Neha, Riya Makeup Studio received ₹20,000 by UPI on 25 Sep. Everything is paid. Thank you!");
  });

  it("writes the amount in words, in lakh and crore", () => {
    expect(rupeesInWords(46829)).toBe("Rupees Forty-Six Thousand Eight Hundred Twenty-Nine Only");
    expect(rupeesInWords(1_50_00_000)).toBe("Rupees One Crore Fifty Lakh Only");
    expect(rupeesInWords(12_34_56_789)).toBe("Rupees Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine Only");
    expect(rupeesInWords(100)).toBe("Rupees One Hundred Only");
    expect(rupeesInWords(1050.5)).toBe("Rupees One Thousand Fifty and Fifty Paise Only");
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
  });
});

import { activityText, dailySummaryMessage, overallScore, percentOf, scoreBand } from "./index.js";

describe("scores", () => {
  it("averages only the measures that had something to measure", () => {
    expect(percentOf(3, 4)).toBe(75);
    expect(percentOf(0, 0)).toBeNull();
    expect(overallScore([{ done: 9, total: 10 }, { done: 1, total: 2 }, { done: 0, total: 0 }])).toBe(70);
    expect(overallScore([{ done: 0, total: 0 }])).toBeNull();
    expect([scoreBand(92), scoreBand(70), scoreBand(40)]).toEqual(["great", "good", "low"]);
  });
});

describe("activity sentences", () => {
  const base = { actorName: "Riya", subject: null, other: null, amount: null, detail: null };
  it("reads like a person telling you", () => {
    expect(activityText({ ...base, action: "task.done", subject: "Kit packed", detail: "Kavya's wedding", late: true })).toBe(
      "ticked off “Kit packed” for Kavya's wedding, late",
    );
    expect(activityText({ ...base, action: "payment.recorded", amount: 20000, other: "Kavya Rao" })).toBe("recorded ₹20,000 from Kavya Rao");
    expect(activityText({ ...base, action: "task.assigned", subject: "Call the florist", other: "Aman" })).toBe("gave Aman a task: “Call the florist”");
    expect(activityText({ ...base, action: "lead.stage_changed", subject: "Neha", detail: "Booked" })).toBe("moved Neha to Booked");
    expect(activityText({ ...base, action: "expense.rejected", other: "Aman", amount: 1500, detail: "Add the bill photo" })).toBe(
      "sent back Aman's expense of ₹1,500: Add the bill photo",
    );
  });
  it("tells whole sentences when a client or the enquiry form did it", () => {
    expect(activityText({ ...base, actorName: null, action: "quote.accepted", subject: "Q-0003", other: "Kavya Rao", amount: 29500 })).toBe(
      "Kavya Rao accepted quote Q-0003 (₹29,500)",
    );
    expect(activityText({ ...base, actorName: null, action: "lead.created", subject: "Neha", detail: "enquiry form" })).toBe(
      "New enquiry from Neha via the enquiry form",
    );
  });
});

describe("daily summary message", () => {
  it("puts the day and tomorrow in a few short lines", () => {
    const text = dailySummaryMessage(
      {
        date: "2026-09-25",
        received: { total: 45000, count: 2 },
        newLeads: 2,
        booked: 1,
        tasksDone: 6,
        lateTasks: [
          { name: "Aman Verma", count: 2 },
          { name: null, count: 1 },
        ],
        expensesWaiting: 1,
        tomorrow: {
          date: "2026-09-26",
          events: [{ title: "Kavya's wedding", functions: [{ name: "Mehendi", time: "16:00" }], team: ["Aman Verma", "Pooja Singh"] }],
          tasksDue: 3,
          off: ["Ravi Kumar"],
        },
      },
      "Riya Makeup Studio",
    );
    expect(text).toBe(
      [
        "*Riya Makeup Studio: Fri 25 Sep*",
        "",
        "₹45,000 received (2 payments)",
        "2 new enquiries, 1 booked",
        "6 tasks done",
        "Late: Aman 2, Anyone 1",
        "1 expense waiting for approval",
        "",
        "*Tomorrow, Sat 26 Sep*",
        "Kavya's wedding: Mehendi 4 pm. Team: Aman, Pooja",
        "3 tasks due",
        "Off: Ravi",
      ].join("\n"),
    );
  });
});

import { billingStatus, daysLeft, PLAN_INFO } from "./index.js";

describe("plans and billing", () => {
  const now = new Date("2026-09-25T12:00:00Z");
  const sub = (status: "created" | "active" | "past_due" | "cancelled" | "completed", currentPeriodEnd: string | null) => ({ status, currentPeriodEnd });
  it("prices a year at ten months", () => {
    for (const p of Object.values(PLAN_INFO)) expect(p.yearly).toBe(p.monthly * 10);
  });
  it("knows whether a business is on trial, paying, or has run out", () => {
    expect(billingStatus({ trialEndsAt: "2026-10-01T00:00:00Z", subscription: null }, now)).toBe("trial");
    expect(billingStatus({ trialEndsAt: "2026-09-20T00:00:00Z", subscription: null }, now)).toBe("expired");
    // Checkout started but never paid: still the trial, or expired after it.
    expect(billingStatus({ trialEndsAt: "2026-09-20T00:00:00Z", subscription: sub("created", null) }, now)).toBe("expired");
    expect(billingStatus({ trialEndsAt: "2026-09-20T00:00:00Z", subscription: sub("active", "2026-10-20T00:00:00Z") }, now)).toBe("active");
    expect(billingStatus({ trialEndsAt: "2026-09-20T00:00:00Z", subscription: sub("past_due", "2026-10-20T00:00:00Z") }, now)).toBe("past_due");
    // Cancelled: works until the paid period ends.
    expect(billingStatus({ trialEndsAt: "2026-09-20T00:00:00Z", subscription: sub("cancelled", "2026-10-01T00:00:00Z") }, now)).toBe("active");
    expect(billingStatus({ trialEndsAt: "2026-09-20T00:00:00Z", subscription: sub("cancelled", "2026-09-24T00:00:00Z") }, now)).toBe("expired");
    expect(billingStatus({ trialEndsAt: "2026-09-20T00:00:00Z", subscription: sub("active", "2026-09-24T00:00:00Z") }, now)).toBe("expired");
  });
  it("counts days left, rounding up", () => {
    expect(daysLeft("2026-09-26T11:00:00Z", now)).toBe(1);
    expect(daysLeft("2026-10-09T12:00:00Z", now)).toBe(14);
    expect(daysLeft("2026-09-20T00:00:00Z", now)).toBe(0);
  });
});

import { eventIsOver, portalMessage, referralMessage, reviewMessage } from "./index.js";

describe("reviews and referrals", () => {
  it("counts an event as over once it's done or its last day has passed", () => {
    expect(eventIsOver({ status: "confirmed", endDate: "2026-09-24" }, "2026-09-25")).toBe(true);
    expect(eventIsOver({ status: "confirmed", endDate: "2026-09-25" }, "2026-09-25")).toBe(false);
    expect(eventIsOver({ status: "confirmed", endDate: null }, "2026-09-25")).toBe(false);
    expect(eventIsOver({ status: "completed", endDate: "2026-12-01" }, "2026-09-25")).toBe(true);
    expect(eventIsOver({ status: "cancelled", endDate: "2026-09-01" }, "2026-09-25")).toBe(false);
  });
  it("writes the messages in the business's voice, by first name", () => {
    expect(portalMessage({ clientName: "Kavya Rao", business: "Riya Studio", link: "https://x/c/t" })).toBe(
      "Hi Kavya, here is your page with Riya Studio. It has your event dates, quotes, invoices and payments, always up to date: https://x/c/t",
    );
    const review = reviewMessage({ clientName: " Kavya Rao ", business: "Riya Studio", link: "https://g.page/r/abc/review" });
    expect(review.startsWith("Hi Kavya, thank you for choosing Riya Studio!")).toBe(true);
    expect(review.endsWith("https://g.page/r/abc/review")).toBe(true);
    expect(referralMessage({ business: "Riya Studio", link: "https://x/f/riya?ref=abc" })).toContain("send them your enquiry here: https://x/f/riya?ref=abc");
  });
  it("tells the activity log about pages and review requests", () => {
    const base = { actorName: "Riya", subject: null, other: null, amount: null, detail: null, late: false };
    expect(activityText({ ...base, action: "client.portal_shared", subject: "Kavya Rao" })).toBe("shared Kavya Rao's page with them");
    expect(activityText({ ...base, action: "client.portal_stopped", subject: "Kavya Rao" })).toBe("stopped sharing Kavya Rao's page");
    expect(activityText({ ...base, action: "event.review_requested", subject: "Rao wedding", other: "Kavya Rao" })).toBe(
      "asked Kavya Rao for a review of Rao wedding",
    );
    expect(activityText({ ...base, actorName: null, action: "lead.created", subject: "Neha", detail: "enquiry form", other: "Kavya Rao" })).toBe(
      "New enquiry from Neha via the enquiry form, recommended by Kavya Rao",
    );
  });
});

import { deliverableMessage, deliverableSuggestions, suggestedDue } from "./index.js";

describe("deliverables", () => {
  it("dates suggestions from the event: after its last day, or before its first", () => {
    const event = { startDate: "2026-11-19", endDate: "2026-11-20" };
    expect(suggestedDue(30, event)).toBe("2026-12-20");
    expect(suggestedDue(-21, event)).toBe("2026-10-29");
    expect(suggestedDue(0, { startDate: "2026-11-19", endDate: null })).toBe("2026-11-19");
    expect(suggestedDue(7, { startDate: null, endDate: null })).toBeNull();
  });
  it("suggests for every trade, with a fallback", () => {
    expect(deliverableSuggestions("photographer").map((s) => s.title)).toContain("Edited photos");
    expect(deliverableSuggestions("something_new")).toEqual([{ title: "Event photos", days: 7 }]);
  });
  it("tells the client it's ready", () => {
    expect(deliverableMessage({ clientName: "Kavya Rao", business: "Lens Studio", title: "Edited photos", link: "https://x.io/g" })).toBe(
      "Hi Kavya, your edited photos from Lens Studio are ready! Here it is: https://x.io/g",
    );
    expect(deliverableMessage({ clientName: "Kavya", business: "Lens Studio", title: "Wedding album", link: null })).toBe(
      "Hi Kavya, your wedding album from Lens Studio is ready!",
    );
  });
});

import { describeRepeat, latestOccurrence, nextOccurrence, weekdayOf } from "./index.js";

describe("repeating tasks", () => {
  // 2026-09-28 is a Monday.
  const weekly = { frequency: "weekly" as const, weekdays: [1, 3, 5], monthDay: null, startDate: "2026-09-01" };
  it("knows the day of the week", () => {
    expect(weekdayOf("2026-09-28")).toBe(1);
    expect(weekdayOf("2026-10-04")).toBe(7);
  });
  it("finds the latest day it falls on, never before it starts", () => {
    expect(latestOccurrence({ ...weekly, frequency: "daily" }, "2026-09-30")).toBe("2026-09-30");
    expect(latestOccurrence(weekly, "2026-09-29")).toBe("2026-09-28");
    expect(latestOccurrence(weekly, "2026-09-27")).toBe("2026-09-25");
    expect(latestOccurrence({ ...weekly, startDate: "2026-09-29" }, "2026-09-29")).toBeNull();
    const monthly = { frequency: "monthly" as const, weekdays: [], monthDay: 31, startDate: "2026-01-01" };
    expect(latestOccurrence(monthly, "2026-09-30")).toBe("2026-09-30");
    expect(latestOccurrence(monthly, "2026-10-15")).toBe("2026-09-30");
    expect(latestOccurrence({ ...monthly, monthDay: 5 }, "2026-10-04")).toBe("2026-09-05");
  });
  it("finds the next day", () => {
    expect(nextOccurrence(weekly, "2026-09-29")).toBe("2026-09-30");
    expect(nextOccurrence({ ...weekly, startDate: "2026-10-10" }, "2026-09-29")).toBe("2026-10-12");
    expect(nextOccurrence({ frequency: "monthly", weekdays: [], monthDay: 31, startDate: "2026-01-01" }, "2026-02-01")).toBe("2026-02-28");
  });
  it("says it plainly", () => {
    expect(describeRepeat(weekly)).toBe("Every Mon, Wed and Fri");
    expect(describeRepeat({ frequency: "weekly", weekdays: [1, 2, 3, 4, 5], monthDay: null })).toBe("Every weekday");
    expect(describeRepeat({ frequency: "weekly", weekdays: [7], monthDay: null })).toBe("Every Sun");
    expect(describeRepeat({ frequency: "daily", weekdays: [], monthDay: null })).toBe("Every day");
    expect(describeRepeat({ frequency: "monthly", weekdays: [], monthDay: 22 })).toBe("Every month on the 22nd");
    expect(describeRepeat({ frequency: "monthly", weekdays: [], monthDay: 11 })).toBe("Every month on the 11th");
  });
});

import { checkCustomValue, formatCustomValue } from "./index.js";

describe("custom fields", () => {
  const f = (kind: "text" | "number" | "date" | "choice" | "yes_no", options: string[] = []) => ({ id: "f", label: "L", kind, options });
  it("cleans values and says what's wrong", () => {
    expect(checkCustomValue(f("text"), "  Oily skin ")).toEqual({ value: "Oily skin" });
    expect(checkCustomValue(f("text"), "")).toEqual({ value: null });
    expect(checkCustomValue(f("number"), "1,20,000")).toEqual({ value: 120000 });
    expect(checkCustomValue(f("number"), "lots")).toEqual({ error: "Enter a number" });
    expect(checkCustomValue(f("date"), "2026-11-20")).toEqual({ value: "2026-11-20" });
    expect(checkCustomValue(f("date"), "20/11/2026")).toEqual({ error: "Pick a date" });
    expect(checkCustomValue(f("choice", ["Dry", "Oily"]), "Oily")).toEqual({ value: "Oily" });
    expect(checkCustomValue(f("choice", ["Dry", "Oily"]), "Wet")).toEqual({ error: "Pick one from the list" });
    expect(checkCustomValue(f("yes_no"), "true")).toEqual({ value: true });
    expect(checkCustomValue(f("yes_no"), "maybe")).toEqual({ error: "Choose yes or no" });
  });
  it("shows values the way people read them", () => {
    expect(formatCustomValue(f("yes_no"), false)).toBe("No");
    expect(formatCustomValue(f("date"), "2026-11-20")).toBe("20 Nov 2026");
    expect(formatCustomValue(f("number"), 120000)).toBe("1,20,000");
    expect(formatCustomValue(f("text"), null)).toBeNull();
  });
});

describe("messages to clients", () => {
  it("has presets for every audience that fill in cleanly", () => {
    for (const a of BROADCAST_AUDIENCES) expect(BROADCAST_PRESETS.some((p) => p.audience === a)).toBe(true);
    for (const p of BROADCAST_PRESETS) {
      const text = renderTemplate(p.message, { name: "Neha Kapoor", business: "Riya Makeup Studio" });
      expect(text).toContain("Neha");
      expect(text).toContain("Riya Makeup Studio");
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text.length).toBeLessThan(400);
    }
    expect(new Set(BROADCAST_PRESETS.map((p) => p.id)).size).toBe(BROADCAST_PRESETS.length);
  });

  it("counts skipped people as done", () => {
    expect(broadcastProgress({ total: 40, sent: 10, skipped: 2 })).toEqual({ done: 12, left: 28, percent: 30 });
    expect(broadcastProgress({ total: 0, sent: 0, skipped: 0 })).toEqual({ done: 0, left: 0, percent: 0 });
  });
});

