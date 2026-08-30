// Package runtime hosts process-lifetime worker coordination.
package runtime

import (
	"context"
	"time"
)

type OutboxEvent struct {
	ID, Topic, PartitionKey string
	SchemaVersion           int
	Payload                 []byte
}
type OutboxStore interface {
	Lease(context.Context, int, time.Duration) ([]OutboxEvent, error)
	MarkPublished(context.Context, string) error
}
type JobPublisher interface {
	PublishJob(context.Context, OutboxEvent) error
}

// RunOutboxDispatcher provides at-least-once dispatch. The caller owns worker
// supervision and logging; adapters own Postgres leasing and Redis publishing.
func RunOutboxDispatcher(ctx context.Context, period, lease time.Duration, batch int, store OutboxStore, publisher JobPublisher, report func(error)) {
	ticker := time.NewTicker(period)
	defer ticker.Stop()
	for {
		events, err := store.Lease(ctx, batch, lease)
		if err == nil {
			for _, event := range events {
				if err = publisher.PublishJob(ctx, event); err == nil {
					err = store.MarkPublished(ctx, event.ID)
				}
				if err != nil {
					break
				}
			}
		}
		if err != nil && ctx.Err() == nil && report != nil {
			report(err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
