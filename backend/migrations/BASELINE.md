# Atlas production baseline

When cutting over an existing production database that already matches
`testdata/schema/current.sql` / `migrations/20260804120000_baseline.sql`:

1. Take a verified Postgres backup.
2. Inspect live schema and reject any drift vs the fixture:
   `atlas schema diff --from "$DATABASE_URL" --to "file://testdata/schema/current.sql"`
3. If empty (no drift), stamp the baseline revision without replaying DDL:
   `atlas migrate set 20260804120000 --dir file://migrations --url "$DATABASE_URL"`
4. Future schema changes ship only as reviewed versioned Atlas migrations
   (expand/contract). Never combine destructive DDL with the ORM cutover.

Empty installs apply migrations normally:
`atlas migrate apply --dir file://migrations --url "$DATABASE_URL"`
