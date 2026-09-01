package plugins

import (
	"context"
	"sync"
)

type MemoryEventBus struct {
	mu          sync.RWMutex
	subscribers map[EventType][]EventHandler
}

func NewMemoryEventBus() *MemoryEventBus {
	return &MemoryEventBus{
		subscribers: make(map[EventType][]EventHandler),
	}
}

func (b *MemoryEventBus) Subscribe(eventType EventType, handler EventHandler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.subscribers[eventType] = append(b.subscribers[eventType], handler)
}

func (b *MemoryEventBus) Publish(ctx context.Context, event Event) {
	b.mu.RLock()
	handlers := append([]EventHandler(nil), b.subscribers[event.Type]...)
	b.mu.RUnlock()

	for _, h := range handlers {
		go func(handler EventHandler) {
			_ = handler(ctx, event)
		}(h)
	}
}
