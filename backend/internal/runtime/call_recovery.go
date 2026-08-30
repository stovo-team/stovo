package runtime

import (
	"context"
	"time"

	featurecalls "stovo-messenger/backend/internal/features/calls"
)

// ActiveCallRecoveryStore is the narrow durable-call view needed during
// process startup. Runtime owns the retry-free recovery loop; the calls
// feature continues to own persistence semantics.
type ActiveCallRecoveryStore interface {
	Active(context.Context, time.Duration) ([]featurecalls.Session, error)
	Participants(context.Context, string) ([]featurecalls.Participant, error)
}

// CallRecoveryLogger reports startup recovery without coupling runtime to a
// concrete logging adapter.
type CallRecoveryLogger interface {
	Warnf(loggerName, format string, args ...any)
	Infof(loggerName, format string, args ...any)
}

// RestoreActiveCalls loads recently active durable calls and hands each
// persistence-neutral snapshot to the live-session owner. A participant query
// failure does not discard the durable call: the receiver can retain its
// compatibility fallback participants.
func RestoreActiveCalls(ctx context.Context, store ActiveCallRecoveryStore, lookback time.Duration, restore func(featurecalls.Session, []featurecalls.Participant), logger CallRecoveryLogger) {
	if store == nil || restore == nil {
		return
	}
	sessions, err := store.Active(ctx, lookback)
	if err != nil {
		if logger != nil {
			logger.Warnf("calls", "restore active calls query failed error=%v", err)
		}
		return
	}
	for _, session := range sessions {
		participants, err := store.Participants(ctx, session.ID)
		if err != nil && logger != nil {
			logger.Warnf("calls", "restore call participants failed room_id=%s error=%v", session.ID, err)
		}
		restore(session, participants)
	}
	if len(sessions) > 0 && logger != nil {
		logger.Infof("calls", "restored active calls count=%d", len(sessions))
	}
}
