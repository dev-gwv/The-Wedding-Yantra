/**
 * Shared API contracts between the API, the web app and (later) the mobile app.
 * Anything that crosses the network boundary belongs here. Request bodies are Zod
 * schemas so every client validates exactly like the server does.
 */
export * from "./auth.js";
export * from "./bookings.js";
export * from "./billing.js";
export * from "./broadcasts.js";
export * from "./business-types.js";
export * from "./common.js";
export * from "./custom.js";
export * from "./lists.js";
export * from "./deliverables.js";
export * from "./expenses.js";
export * from "./grow.js";
export * from "./home.js";
export * from "./inventory.js";
export * from "./invoicing.js";
export * from "./money.js";
export * from "./reports.js";
export * from "./review.js";
export * from "./sales.js";
export * from "./tasks.js";
export * from "./team.js";
export * from "./vendors.js";
export * from "./workspaces.js";
