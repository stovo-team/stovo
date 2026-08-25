package ports

import "context"

// Event is a transport-neutral application event payload.
type Event map[string]any

// EventHandler processes one event delivered by an EventBroker.
type EventHandler func(Event) error

// EventBroker publishes and subscribes to application events.
type EventBroker interface {
	Publish(context.Context, string, Event) error
	Subscribe(context.Context, string, EventHandler) error
}
