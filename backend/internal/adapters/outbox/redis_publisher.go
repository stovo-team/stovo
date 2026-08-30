package outbox

import (
	"context"

	"github.com/redis/go-redis/v9"
	workruntime "stovo-messenger/backend/internal/runtime"
)

// RedisPublisher writes outbox events to the job stream consumed by runtime
// workers. Consumers remain responsible for their own idempotency receipts.
type RedisPublisher struct {
	client *redis.Client
	stream string
}

func NewRedisPublisher(client *redis.Client, stream string) *RedisPublisher {
	return &RedisPublisher{client: client, stream: stream}
}

func (p *RedisPublisher) PublishJob(ctx context.Context, event workruntime.OutboxEvent) error {
	return p.client.XAdd(ctx, &redis.XAddArgs{
		Stream: p.stream,
		Values: map[string]any{
			"event_id":       event.ID,
			"topic":          event.Topic,
			"schema_version": event.SchemaVersion,
			"partition_key":  event.PartitionKey,
			"payload":        string(event.Payload),
		},
	}).Err()
}
