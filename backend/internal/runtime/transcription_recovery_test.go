package runtime

import (
	"context"
	"errors"
	"testing"
)

type recoveryStore struct {
	count int
	err   error
	calls int
}

func (s *recoveryStore) RecoverInterrupted(context.Context) (int, error) {
	s.calls++
	return s.count, s.err
}

type recoveryLogger struct{ infos, warns int }

func (l *recoveryLogger) Warnf(string, string, ...any) { l.warns++ }
func (l *recoveryLogger) Infof(string, string, ...any) { l.infos++ }

func TestRecoverInterruptedTranscriptionSessions(t *testing.T) {
	store := &recoveryStore{count: 2}
	logger := &recoveryLogger{}
	RecoverInterruptedTranscriptionSessions(context.Background(), store, logger)
	if store.calls != 1 || logger.infos != 1 || logger.warns != 0 {
		t.Fatalf("calls=%d infos=%d warns=%d", store.calls, logger.infos, logger.warns)
	}
}

func TestRecoverInterruptedTranscriptionSessionsReportsFailure(t *testing.T) {
	store := &recoveryStore{err: errors.New("unavailable")}
	logger := &recoveryLogger{}
	RecoverInterruptedTranscriptionSessions(context.Background(), store, logger)
	if logger.warns != 1 || logger.infos != 0 {
		t.Fatalf("infos=%d warns=%d", logger.infos, logger.warns)
	}
}
