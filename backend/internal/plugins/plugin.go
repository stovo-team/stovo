package plugins

import (
	"context"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/config"
)

type EventType string

const (
	EventMessageSent   EventType = "message:sent"
	EventUserJoined    EventType = "user:joined"
	EventMediaUploaded EventType = "media:uploaded"
	EventCallStarted   EventType = "call:started"
)

type Event struct {
	Type      EventType              `json:"type"`
	Timestamp time.Time              `json:"timestamp"`
	Payload   map[string]interface{} `json:"payload"`
}

type EventHandler func(ctx context.Context, event Event) error

type EventBus interface {
	Publish(ctx context.Context, event Event)
	Subscribe(eventType EventType, handler EventHandler)
}

type Services struct {
	Config   *config.Config
	EventBus EventBus
}

type Plugin interface {
	ID() string
	Name() string
	Init(services Services) error
	RegisterRoutes(r chi.Router)
	SubscribeEvents(bus EventBus)
}

type PluginRegistry struct {
	mu      sync.RWMutex
	plugins map[string]Plugin
}

func NewPluginRegistry() *PluginRegistry {
	return &PluginRegistry{
		plugins: make(map[string]Plugin),
	}
}

func (r *PluginRegistry) Register(p Plugin) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.plugins[p.ID()] = p
}

func (r *PluginRegistry) Get(id string) (Plugin, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.plugins[id]
	return p, ok
}

func (r *PluginRegistry) List() []Plugin {
	r.mu.RLock()
	defer r.mu.RUnlock()
	list := make([]Plugin, 0, len(r.plugins))
	for _, p := range r.plugins {
		list = append(list, p)
	}
	return list
}
