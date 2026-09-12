ALTER TABLE guest_meeting_sessions
  DROP CONSTRAINT guest_meeting_sessions_state_check;

ALTER TABLE guest_meeting_sessions
  ADD CONSTRAINT guest_meeting_sessions_state_check
  CHECK (state IN ('waiting', 'admitted', 'blocked', 'left'));

ALTER TABLE guest_meeting_sessions
  ADD COLUMN left_at timestamptz;

-- Sessions created before explicit departure tracking had no reliable way to
-- distinguish a live browser from an abandoned tab. Start the new lifecycle
-- cleanly so old rows cannot inflate the guest count indefinitely.
UPDATE guest_meeting_sessions
SET state = 'left', left_at = now()
WHERE state = 'admitted';
