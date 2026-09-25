import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  can,
  canManageMember,
  formatDate,
  formatMoney,
  formatMoneyShort,
  formatPhone,
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
