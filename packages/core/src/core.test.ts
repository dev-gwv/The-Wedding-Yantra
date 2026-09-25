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
