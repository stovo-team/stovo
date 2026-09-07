package builtins

import (
	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/plugins"
)

// ChecklistPlugin advertises the built-in Shared Checklists plugin.
// Its protected routes and real-time handlers are composed by app.Server
// using the same family and chat authorization boundaries as core chat features.
type ChecklistPlugin struct{}

func NewChecklistPlugin() *ChecklistPlugin               { return &ChecklistPlugin{} }
func (p *ChecklistPlugin) ID() string                    { return "plugin-checklist" }
func (p *ChecklistPlugin) Name() string                  { return "Shared Checklists" }
func (p *ChecklistPlugin) Init(plugins.Services) error   { return nil }
func (p *ChecklistPlugin) RegisterRoutes(chi.Router)     {}
func (p *ChecklistPlugin) SubscribeEvents(plugins.EventBus) {}
