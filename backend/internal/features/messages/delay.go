package messages

import (
	"context"
	"fmt"
	"time"
)

// DelayStore supplies only the persistence fact needed for chat slow mode.
// The concrete store is responsible for filtering deleted messages and for
// selecting the newest message atomically with its own persistence model.
type DelayStore interface {
	GetLastUserMessageCreatedAt(context.Context, string, string) (string, error)
}

// SlowModeInput is the transport-neutral data needed to enforce a chat's
// message delay. Managers bypass slow mode as part of the business rule.
type SlowModeInput struct {
	ChatID       string
	SenderID     string
	DelaySeconds int
	CanManage    bool
}

// SlowModeError reports the whole-second wait remaining before a message may
// be sent. Transports retain ownership of their status-code/error encoding.
type SlowModeError struct {
	RemainingSeconds int
}

func (e *SlowModeError) Error() string {
	return fmt.Sprintf("message delay is active; wait %d second(s)", e.RemainingSeconds)
}

type DelayService struct {
	store DelayStore
	now   func() time.Time
}

func NewDelayService(store DelayStore, now func() time.Time) *DelayService {
	if now == nil {
		now = time.Now
	}
	return &DelayService{store: store, now: now}
}

// Check returns a SlowModeError when the sender must wait. A missing or
// unparsable legacy timestamp deliberately behaves as no prior message, which
// preserves the existing availability-first behavior.
func (s *DelayService) Check(ctx context.Context, input SlowModeInput) error {
	if input.DelaySeconds <= 0 || input.CanManage {
		return nil
	}
	lastCreatedAt, err := s.store.GetLastUserMessageCreatedAt(ctx, input.ChatID, input.SenderID)
	if err != nil || lastCreatedAt == "" {
		return nil
	}
	createdAt, ok := parseCreatedAt(lastCreatedAt)
	if !ok {
		return nil
	}
	requiredDelay := time.Duration(input.DelaySeconds) * time.Second
	elapsed := s.now().Sub(createdAt)
	if elapsed >= requiredDelay {
		return nil
	}
	remaining := int((requiredDelay - elapsed + 999*time.Millisecond) / time.Second)
	if remaining <= 0 {
		remaining = 1
	}
	return &SlowModeError{RemainingSeconds: remaining}
}

func parseCreatedAt(value string) (time.Time, bool) {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err == nil {
		return parsed, true
	}
	parsed, err = time.Parse(time.RFC3339, value)
	return parsed, err == nil
}
