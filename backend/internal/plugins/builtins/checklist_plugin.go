package builtins

import (
	"context"
	"sync/atomic"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/adapters/statsstore"
	"stovo-messenger/backend/internal/plugins"
)

// ChecklistPlugin advertises the built-in Shared Checklists plugin.
// Its protected routes and real-time handlers are composed by app.Server
// using the same family and chat authorization boundaries as core chat features.
type ChecklistPlugin struct {
	store   *statsstore.PostgresStore
	enabled atomic.Bool
}

func NewChecklistPlugin() *ChecklistPlugin {
	p := &ChecklistPlugin{}
	p.enabled.Store(true)
	return p
}

func (p *ChecklistPlugin) ID() string   { return "plugin-checklist" }
func (p *ChecklistPlugin) Name() string { return "Shared Checklists" }

func (p *ChecklistPlugin) Init(services plugins.Services) error {
	if store, ok := services.StatsStore.(*statsstore.PostgresStore); ok {
		p.store = store
		if enabled, found, err := store.PluginEnabled(context.Background(), p.ID()); err == nil && found {
			p.enabled.Store(enabled)
		}
	}
	return nil
}

func (p *ChecklistPlugin) Enabled() bool {
	return p.enabled.Load()
}

func (p *ChecklistPlugin) SetEnabled(ctx context.Context, enabled bool) error {
	if p.store != nil {
		if err := p.store.SetPluginEnabled(ctx, p.ID(), enabled); err != nil {
			return err
		}
	}
	p.enabled.Store(enabled)
	return nil
}

func (p *ChecklistPlugin) RegisterRoutes(chi.Router)     {}
func (p *ChecklistPlugin) SubscribeEvents(plugins.EventBus) {}
