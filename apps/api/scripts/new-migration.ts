// Creates the next numbered migration file.
// Usage: pnpm --filter @wedding-yantra/api migration:new add_phone_to_bookings
import { readdirSync, writeFileSync } from "node:fs";

const name = process.argv[2];
if (!name || !/^[a-z0-9_]+$/.test(name)) {
  console.error(
    "Usage: pnpm --filter @wedding-yantra/api migration:new <name>\n" +
      "  <name>: lowercase letters, digits and underscores, e.g. add_phone_to_bookings",
  );
  process.exit(1);
}

const dir = new URL("../migrations/", import.meta.url);
const numbers = readdirSync(dir)
  .map((f) => /^(\d{4})_/.exec(f)?.[1])
  .filter((n): n is string => n !== undefined)
  .map(Number);
const next = String(Math.max(0, ...numbers) + 1).padStart(4, "0");
const file = `${next}_${name}.sql`;

writeFileSync(
  new URL(file, dir),
  `-- ${file}\n` +
    "-- Runs once, inside a transaction, the next time the API starts.\n" +
    "-- Keep it backward-compatible: add tables/columns; don't drop or rename in the same release.\n\n",
  { flag: "wx" },
);
console.log(`Created apps/api/migrations/${file}`);
