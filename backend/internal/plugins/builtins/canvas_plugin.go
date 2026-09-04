package builtins

import (
	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/plugins"
)

// CanvasPlugin advertises the built-in Canvas surface in the server manifest.
// Its protected routes and Socket.IO handlers are composed by app.Server so
// they can use the same chat membership authorization as core chat features.
type CanvasPlugin struct{}

func NewCanvasPlugin() *CanvasPlugin                     { return &CanvasPlugin{} }
func (p *CanvasPlugin) ID() string                       { return "plugin-canvas" }
func (p *CanvasPlugin) Name() string                     { return "Shared Canvas" }
func (p *CanvasPlugin) Init(plugins.Services) error      { return nil }
func (p *CanvasPlugin) RegisterRoutes(chi.Router)        {}
func (p *CanvasPlugin) SubscribeEvents(plugins.EventBus) {}
