package plugins

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/config"
)

type EventType string

const (
	EventMessageSent   EventType = "message:sent"
	EventMessageRead   EventType = "message:read"
	EventReactionAdded EventType = "reaction:added"
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
	Config     *config.Config
	EventBus   EventBus
	StatsStore any
}

type Plugin interface {
	ID() string
	Name() string
	Init(services Services) error
	RegisterRoutes(r chi.Router)
	SubscribeEvents(bus EventBus)
}

// ConfigurablePlugin is implemented by plugins that can be switched on and
// off without restarting the server. The registry deliberately keeps this
// optional so passive plugins do not need toggle plumbing.
type ConfigurablePlugin interface {
	Plugin
	Enabled() bool
	SetEnabled(ctx context.Context, enabled bool) error
}

type Status struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
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

// Statuses includes disabled plugins as well, so an administrator can enable
// a plugin again from the plugin store.
func (r *PluginRegistry) Statuses() []Status {
	r.mu.RLock()
	defer r.mu.RUnlock()
	statuses := make([]Status, 0, len(r.plugins))
	for _, p := range r.plugins {
		enabled := true
		if configurable, ok := p.(ConfigurablePlugin); ok {
			enabled = configurable.Enabled()
		}
		statuses = append(statuses, Status{ID: p.ID(), Name: p.Name(), Enabled: enabled})
	}
	return statuses
}

func (r *PluginRegistry) SetEnabled(ctx context.Context, id string, enabled bool) (Status, error) {
	r.mu.RLock()
	p, ok := r.plugins[id]
	r.mu.RUnlock()
	if !ok {
		return Status{}, errors.New("plugin not found")
	}
	configurable, ok := p.(ConfigurablePlugin)
	if !ok {
		return Status{}, errors.New("plugin cannot be configured")
	}
	if err := configurable.SetEnabled(ctx, enabled); err != nil {
		return Status{}, err
	}
	return Status{ID: p.ID(), Name: p.Name(), Enabled: configurable.Enabled()}, nil
}
