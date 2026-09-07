package builtins

import (
	"context"
	"sync/atomic"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/adapters/statsstore"
	"stovo-messenger/backend/internal/plugins"
)

// CanvasPlugin advertises the built-in Canvas surface in the server manifest.
// Its protected routes and Socket.IO handlers are composed by app.Server so
// they can use the same chat membership authorization as core chat features.
type CanvasPlugin struct {
	store   *statsstore.PostgresStore
	enabled atomic.Bool
}

func NewCanvasPlugin() *CanvasPlugin {
	p := &CanvasPlugin{}
	p.enabled.Store(true)
	return p
}

func (p *CanvasPlugin) ID() string   { return "plugin-canvas" }
func (p *CanvasPlugin) Name() string { return "Shared Canvas" }

func (p *CanvasPlugin) Init(services plugins.Services) error {
	if store, ok := services.StatsStore.(*statsstore.PostgresStore); ok {
		p.store = store
		if enabled, found, err := store.PluginEnabled(context.Background(), p.ID()); err == nil && found {
			p.enabled.Store(enabled)
		}
	}
	return nil
}

func (p *CanvasPlugin) Enabled() bool {
	return p.enabled.Load()
}

func (p *CanvasPlugin) SetEnabled(ctx context.Context, enabled bool) error {
	if p.store != nil {
		if err := p.store.SetPluginEnabled(ctx, p.ID(), enabled); err != nil {
			return err
		}
	}
	p.enabled.Store(enabled)
	return nil
}

func (p *CanvasPlugin) RegisterRoutes(chi.Router)        {}
func (p *CanvasPlugin) SubscribeEvents(plugins.EventBus) {}
