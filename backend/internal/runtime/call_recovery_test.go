package runtime

import (
	"context"
	"errors"
	"testing"
	"time"

	featurecalls "stovo-messenger/backend/internal/features/calls"
)

type callRecoveryStoreStub struct {
	sessions  []featurecalls.Session
	activeErr error
	parts     map[string][]featurecalls.Participant
	partErr   error
}

func (s callRecoveryStoreStub) Active(context.Context, time.Duration) ([]featurecalls.Session, error) {
	return s.sessions, s.activeErr
}
func (s callRecoveryStoreStub) Participants(_ context.Context, id string) ([]featurecalls.Participant, error) {
	return s.parts[id], s.partErr
}

func TestRestoreActiveCallsRestoresParticipantSnapshots(t *testing.T) {
	store := callRecoveryStoreStub{sessions: []featurecalls.Session{{ID: "room"}}, parts: map[string][]featurecalls.Participant{"room": {{UserID: "user"}}}}
	var got int
	RestoreActiveCalls(context.Background(), store, time.Hour, func(session featurecalls.Session, participants []featurecalls.Participant) {
		if session.ID != "room" || len(participants) != 1 {
			t.Fatalf("unexpected recovery payload: %#v %#v", session, participants)
		}
		got++
	}, &recoveryLogger{})
	if got != 1 {
		t.Fatalf("restore calls=%d", got)
	}
}

func TestRestoreActiveCallsDoesNotRestoreAfterActiveQueryFailure(t *testing.T) {
	logger := &recoveryLogger{}
	RestoreActiveCalls(context.Background(), callRecoveryStoreStub{activeErr: errors.New("down")}, time.Hour, func(featurecalls.Session, []featurecalls.Participant) { t.Fatal("should not restore") }, logger)
	if logger.warns != 1 {
		t.Fatalf("warns=%d", logger.warns)
	}
}
