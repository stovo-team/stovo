-- Repair databases whose runtime Ent auto-migration removed this Atlas-owned
-- default. Event writers intentionally omit occurred_at and rely on the
-- database clock so every producer records a consistent server timestamp.
ALTER TABLE sync_events
    ALTER COLUMN occurred_at SET DEFAULT now();
