/**
 * Shared API contracts between the API, the web app and (later) the mobile app.
 * Anything that crosses the network boundary belongs here. Request bodies are Zod
 * schemas so every client validates exactly like the server does.
 */
export * from "./auth.js";
export * from "./business-types.js";
export * from "./common.js";
export * from "./home.js";
export * from "./team.js";
export * from "./workspaces.js";
