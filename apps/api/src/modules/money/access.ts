import { can } from "@wedding-yantra/core";
import { forbidden } from "../../lib/http.js";
import type { MemberContext } from "../auth/guard.js";

/** Bills, payments and dues: owners, managers and the accountant. */
export const requireMoneyView = (ctx: MemberContext) => {
  if (!can(ctx.role, "finance.view")) throw forbidden("Your role doesn't include money");
};
export const requireBillsManage = (ctx: MemberContext) => {
  if (!can(ctx.role, "bills.manage")) throw forbidden("Only the owner or a manager can make bills");
};
export const requirePaymentsRecord = (ctx: MemberContext) => {
  if (!can(ctx.role, "payments.record")) throw forbidden("Only the owner or a manager can record payments");
};
