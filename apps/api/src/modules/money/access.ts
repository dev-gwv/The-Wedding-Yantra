import { can } from "@wedding-yantra/core";
import { forbidden } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

/** Bills, payments and dues: owners, managers and the accountant. */
export const requireMoneyView = (ctx: MemberContext) => {
  if (!can(ctx, "finance.view")) throw forbidden("Payments and invoices aren't on your screens. Ask the owner to add them for you");
};
export const requireBillsManage = (ctx: MemberContext) => {
  if (!can(ctx, "bills.manage")) throw forbidden("Only the owner or a manager can make bills");
};
export const requirePaymentsRecord = (ctx: MemberContext) => {
  if (!can(ctx, "payments.record")) throw forbidden("Only the owner or a manager can record payments");
};
