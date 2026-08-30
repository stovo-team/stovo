package outbox

import (
	"context"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	workruntime "stovo-messenger/backend/internal/runtime"
)

type RedisConsumer struct{ client *redis.Client }

func NewRedisConsumer(client *redis.Client) *RedisConsumer { return &RedisConsumer{client: client} }

func (c *RedisConsumer) EnsureGroup(ctx context.Context, stream, group, start string) error {
	err := c.client.XGroupCreateMkStream(ctx, stream, group, start).Err()
	if err != nil && strings.Contains(err.Error(), "BUSYGROUP") {
		return nil
	}
	return err
}

func (c *RedisConsumer) ReadGroup(ctx context.Context, stream, group, consumer, cursor string, count int, block time.Duration) ([]workruntime.JobMessage, error) {
	streams, err := c.client.XReadGroup(ctx, &redis.XReadGroupArgs{Group: group, Consumer: consumer, Streams: []string{stream, cursor}, Count: int64(count), Block: block}).Result()
	if err == redis.Nil {
		return nil, workruntime.ErrNoJobs
	}
	if err != nil {
		return nil, err
	}
	jobs := make([]workruntime.JobMessage, 0)
	for _, result := range streams {
		for _, message := range result.Messages {
			job := workruntime.JobMessage{ID: message.ID}
			job.EventID, _ = message.Values["event_id"].(string)
			job.Topic, _ = message.Values["topic"].(string)
			job.Payload, _ = message.Values["payload"].(string)
			jobs = append(jobs, job)
		}
	}
	return jobs, nil
}

func (c *RedisConsumer) Ack(ctx context.Context, stream, group, id string) error {
	return c.client.XAck(ctx, stream, group, id).Err()
}

var _ workruntime.JobConsumer = (*RedisConsumer)(nil)
