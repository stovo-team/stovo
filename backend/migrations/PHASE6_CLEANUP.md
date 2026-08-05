# Phase 6 — contract cleanup (later release)

Do **not** ship these with the ORM / blue-green cutover. Remove only after
metrics prove unused and a separate reviewed Atlas migration exists.

## Candidates (compatibility artifacts)

| Artifact | Why deferred |
|----------|----------------|
| Backend handlers for `media_quality_settings` | Table preserved in Ent + Atlas; HTTP admin API was already absent from Go handlers while the frontend still has UI stubs. Re-wire or drop UI + table together. |
| `cmd/storage-migrate` raw SQL | One-shot MinIO object migration; exclude from app SQL ban until rewritten or deleted after all installs are on MinIO. |
| Dual Redis + memory call maps | Memory is a cache of Redis after Phase 5; collapsing to Redis-only can wait until multi-instance soak proves no sticky affinity bugs. |
| Ent composite-PK `StorageKey` workaround | True composite PKs live in Atlas SQL; Ent ID mapping is intentional. Do not “fix” with surrogate keys. |

## Rules

1. Never combine destructive DDL (`DROP COLUMN` / `DROP TABLE`) with an ORM or blue/green deploy.
2. Require a backup + `atlas schema diff` empty result before destructive apply.
3. Prefer expand → dual-write/read → contract over in-place drops.
