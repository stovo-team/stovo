package realtimecache

import (
	"context"
	"time"

	workruntime "stovo-messenger/backend/internal/runtime"

	"github.com/redis/go-redis/v9"
)

type RedisPendingEventQueue struct{ client *redis.Client }

func NewRedisPendingEventQueue(client *redis.Client) *RedisPendingEventQueue {
	return &RedisPendingEventQueue{client: client}
}

func (q *RedisPendingEventQueue) Enqueue(ctx context.Context, key string, value []byte, maxLength int, ttl time.Duration) error {
	pipe := q.client.Pipeline()
	pipe.LPush(ctx, key, value)
	pipe.LTrim(ctx, key, 0, int64(maxLength-1))
	pipe.Expire(ctx, key, ttl)
	_, err := pipe.Exec(ctx)
	return err
}

func (q *RedisPendingEventQueue) Drain(ctx context.Context, key string) ([][]byte, error) {
	pipe := q.client.Pipeline()
	values := pipe.LRange(ctx, key, 0, -1)
	pipe.Del(ctx, key)
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, err
	}
	raw := values.Val()
	items := make([][]byte, 0, len(raw))
	for _, value := range raw {
		items = append(items, []byte(value))
	}
	return items, nil
}

var _ workruntime.PendingEventQueue = (*RedisPendingEventQueue)(nil)
