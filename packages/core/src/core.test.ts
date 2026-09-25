import { describe, expect, it } from "vitest";
import {
  assignableRoles,
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

import { leadScope, renderTemplate } from "./index.js";

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
      "Hi Neha, here is your bill INV/26-27/0001 from Riya Makeup Studio for ₹46,829. Balance due: ₹26,829 by 4 Oct. See it and pay by UPI here: https://x.in/b/abc",
    );
    expect(
      receiptMessage({ clientName: "Neha", business: "Riya Makeup Studio", amount: 20000, method: "upi", paidOn: "2026-09-25", due: 0, link: null }),
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
