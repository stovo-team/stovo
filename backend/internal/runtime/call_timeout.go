package runtime

import (
	"context"
	"time"
)

// CallTimeout owns the process-lifetime timer used to supervise a live call.
// The transport retains call-state decisions and event serialization through
// Run; runtime only owns the goroutine and deadline wait.
type CallTimeout struct {
	ExpiresAt time.Time
	Run       func(context.Context)
}

// StartCallTimeout schedules a call-timeout callback. The callback receives a
// background context because live-call supervision is intentionally allowed to
// outlive an individual HTTP or Socket.IO request.
func StartCallTimeout(timeout CallTimeout) {
	go RunCallTimeout(context.Background(), timeout)
}

// RunCallTimeout is the synchronous form used by tests and by runtime hosts
// that want to provide lifecycle cancellation.
func RunCallTimeout(ctx context.Context, timeout CallTimeout) {
	if timeout.Run == nil || !wait(ctx, time.Until(timeout.ExpiresAt)) {
		return
	}
	timeout.Run(ctx)
}
