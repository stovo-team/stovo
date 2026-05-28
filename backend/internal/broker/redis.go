package broker

import (
	"context"
	"encoding/json"

	"github.com/redis/go-redis/v9"
)

type RedisBroker struct {
	client *redis.Client
}

func NewRedisBroker(client *redis.Client) *RedisBroker {
	return &RedisBroker{client: client}
}

func (b *RedisBroker) Publish(ctx context.Context, channel string, event BrokerEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return b.client.Publish(ctx, channel, payload).Err()
}

func (b *RedisBroker) Subscribe(ctx context.Context, channel string, handler EventHandler) error {
	pubsub := b.client.Subscribe(ctx, channel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case message := <-ch:
			if message == nil {
				continue
			}
			payload := BrokerEvent{}
			if err := json.Unmarshal([]byte(message.Payload), &payload); err != nil {
				return err
			}
			if err := handler(payload); err != nil {
				return err
			}
		}
	}
}
