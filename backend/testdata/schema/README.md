# Schema fixtures

`current.sql` is a `pg_dump --schema-only` snapshot of the production-shaped PostgreSQL schema produced by the legacy `initSchema()` bootstrap (all CREATE/ALTER applied).

Use it for:

- Atlas baseline / upgrade-from-current tests
- Ent/Atlas drift rejection against the frozen contract

Do not edit casually; regenerate from a DB that has run the current bootstrap (or Atlas migrations after cutover) when the schema contract intentionally changes.
