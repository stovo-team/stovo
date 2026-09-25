package messages

import (
	"context"
	"errors"
	"testing"
	"time"
)

type delayStoreStub struct {
	value string
	err   error
}

func (s delayStoreStub) GetLastUserMessageCreatedAt(context.Context, string, string) (string, error) {
	return s.value, s.err
}

func TestDelayServiceBlocksUntilWholeSecondBoundary(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	service := NewDelayService(delayStoreStub{value: now.Add(-3200 * time.Millisecond).Format(time.RFC3339Nano)}, func() time.Time { return now })
	err := service.Check(context.Background(), SlowModeInput{ChatID: "chat", SenderID: "user", DelaySeconds: 5})
	var slowMode *SlowModeError
	if !errors.As(err, &slowMode) {
		t.Fatalf("Check() error = %v, want SlowModeError", err)
	}
	if slowMode.RemainingSeconds != 2 {
		t.Fatalf("RemainingSeconds = %d, want 2", slowMode.RemainingSeconds)
	}
}

func TestDelayServiceParsesPostgresTimestampString(t *testing.T) {
	lastCreatedAt := "2026-09-25 10:24:04.0869638 +0000 UTC"
	now := time.Date(2026, 9, 25, 10, 24, 5, 0, time.UTC)
	service := NewDelayService(delayStoreStub{value: lastCreatedAt}, func() time.Time { return now })
	err := service.Check(context.Background(), SlowModeInput{ChatID: "chat", SenderID: "user", DelaySeconds: 60})
	var slowMode *SlowModeError
	if !errors.As(err, &slowMode) {
		t.Fatalf("Check() error = %v, want SlowModeError for PostgreSQL timestamp", err)
	}
	if slowMode.RemainingSeconds != 60 {
		t.Fatalf("RemainingSeconds = %d, want 60", slowMode.RemainingSeconds)
	}
}

func TestDelayServiceBypassesManagersAndStoreFailures(t *testing.T) {
	service := NewDelayService(delayStoreStub{err: errors.New("database unavailable")}, time.Now)
	if err := service.Check(context.Background(), SlowModeInput{DelaySeconds: 10, CanManage: true}); err != nil {
		t.Fatalf("manager Check() error = %v, want nil", err)
	}
	if err := service.Check(context.Background(), SlowModeInput{DelaySeconds: 10}); err != nil {
		t.Fatalf("failed lookup Check() error = %v, want nil", err)
	}
}

func TestDelayServiceAllowsExpiredAndInvalidTimestamps(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 10, 0, time.UTC)
	for _, value := range []string{now.Add(-10 * time.Second).Format(time.RFC3339), "not-a-time"} {
		service := NewDelayService(delayStoreStub{value: value}, func() time.Time { return now })
		if err := service.Check(context.Background(), SlowModeInput{DelaySeconds: 5}); err != nil {
			t.Fatalf("Check(%q) error = %v, want nil", value, err)
		}
	}
}
