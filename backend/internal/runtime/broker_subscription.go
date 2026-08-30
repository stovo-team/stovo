package runtime

import (
	"context"
	"time"

	"stovo-messenger/backend/internal/ports"
)

// BrokerSubscriber is the receive-only broker capability required by a
// process-lifetime subscription worker. Publishing remains owned by the
// driving adapter that creates an event.
type BrokerSubscriber interface {
	Subscribe(context.Context, string, ports.EventHandler) error
}

// RunBrokerSubscription supervises one broker subscription until shutdown.
// A returned subscription error is reported and retried after retryDelay. The
// event handler stays with the driving transport, so runtime owns lifecycle
// mechanics without knowing Socket.IO payloads or delivery policy.
func RunBrokerSubscription(ctx context.Context, broker BrokerSubscriber, channel string, handler ports.EventHandler, retryDelay time.Duration, report func(error)) {
	if retryDelay <= 0 {
		retryDelay = time.Second
	}
	for {
		if ctx.Err() != nil {
			return
		}
		err := broker.Subscribe(ctx, channel, handler)
		if ctx.Err() != nil {
			return
		}
		if err == nil {
			continue
		}
		if report != nil {
			report(err)
		}
		timer := time.NewTimer(retryDelay)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			return
		case <-timer.C:
		}
	}
}
