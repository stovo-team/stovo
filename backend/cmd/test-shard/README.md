# Backend test sharding

`test-durations.json` records the arithmetic mean elapsed seconds for each
successful top-level `internal/app` test across master runs 42071434435,
42155669773, 42171970410 and 42174580276 and PR runs 42104327722,
42169703616 and 42202148142. The 198 existing tests have seven measurements;
the three newer tests have four. Skips and failures are excluded. Skipped and
new tests with no successful measurement use a one-second estimate. The
selector sorts tests by estimated duration and assigns each to the least-loaded shard, with stable name and
shard-index tie breakers. Every discovered name is assigned exactly once;
the file never defines which tests exist.

Shard 0 also runs other work. The master workflow uses a 90-second initial
load, estimated from Ent generation, other packages, and extra checks across
those runs; the PR workflow uses 20 seconds for the other packages. These are
estimates, not timeouts. Update the shared durations and these estimates
from representative timing artifacts when the suite or CI runners change.
All shards in a run must use the same checked-in file and load estimate.
