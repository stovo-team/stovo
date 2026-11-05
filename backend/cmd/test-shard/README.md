# Backend test sharding

`test-durations.json` records elapsed seconds for successful top-level
`internal/app` tests from CI/CD run 42049716950 on 2026-11-05. Skipped and
new tests use a one-second estimate. The selector sorts tests by estimated
duration and assigns each to the least-loaded shard, with stable name and
shard-index tie breakers. Every discovered name is assigned exactly once;
the file never defines which tests exist.

Shard 0 also runs other work. The master workflow uses a 180-second initial
load, estimated from that run's Ent generation, other packages, and extra
checks; the PR workflow uses 55 seconds for the other packages. These are
estimates, not timeouts. Update the shared durations and these estimates
from representative timing artifacts when the suite or CI runners change.
All shards in a run must use the same checked-in file and load estimate.
