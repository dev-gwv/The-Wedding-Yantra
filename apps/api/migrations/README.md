# Database migrations

Every `.sql` file here runs **once**, in number order, when the API starts.
Each file runs inside a transaction: if it fails, it's rolled back, the API refuses to start,
and the deploy rolls back to the previous version. Applied files are recorded in the
`schema_migrations` table.

## Adding a change

```bash
pnpm --filter @wedding-yantra/api migration:new add_instagram_to_workspaces
# -> creates migrations/0004_add_instagram_to_workspaces.sql; write your SQL in it
```

Example:

```sql
ALTER TABLE workspaces ADD COLUMN instagram TEXT;
```

Then update the code that uses it (`apps/api/src`, and `packages/types` if the API response
changes), test locally with `pnpm db:up && pnpm dev`, commit and push.

## Rules

1. **Never edit or delete a migration that has already been deployed.** Add a new one instead.
2. **Keep changes backward-compatible.** The previous API version must keep working against
   the new schema, because an unhealthy deploy rolls back the code but not the database.
   - ✅ Add tables, add nullable columns, add columns with a `DEFAULT`, add indexes.
   - ❌ Drop or rename a column the running code still uses. Do it in two releases:
     first stop using it, then drop it.
3. **Every table that holds a business's data gets a `workspace_id`** column
   (`REFERENCES workspaces (id) ON DELETE CASCADE`), and every query filters by it.
4. Statements that can't run in a transaction (e.g. `CREATE INDEX CONCURRENTLY`) aren't supported.
5. A backup is taken automatically right before every deploy (see `docs/DEPLOYMENT.md`).
