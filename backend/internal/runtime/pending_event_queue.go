package runtime

import (
	"context"
	"time"
)

// PendingEventQueue retains opaque serialized transport events for a briefly
// disconnected user. Ordering and retention are runtime concerns, not feature
// business rules.
type PendingEventQueue interface {
	Enqueue(context.Context, string, []byte, int, time.Duration) error
	Drain(context.Context, string) ([][]byte, error)
}
