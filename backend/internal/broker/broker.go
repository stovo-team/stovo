package broker

import "context"

type BrokerEvent map[string]any

type EventHandler func(BrokerEvent) error

type MessageBrokerService interface {
	Publish(ctx context.Context, channel string, event BrokerEvent) error
	Subscribe(ctx context.Context, channel string, handler EventHandler) error
}
