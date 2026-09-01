package builtins

import (
	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/plugins"
)

type ThemePackPlugin struct {
	availableThemes []string
}

func NewThemePackPlugin() *ThemePackPlugin {
	return &ThemePackPlugin{
		availableThemes: []string{"family_warm", "gamer_dark", "corporate_slate"},
	}
}

func (p *ThemePackPlugin) ID() string {
	return "plugin-theme-packs"
}

func (p *ThemePackPlugin) Name() string {
	return "Community Theme Packs"
}

func (p *ThemePackPlugin) Init(services plugins.Services) error {
	return nil
}

func (p *ThemePackPlugin) RegisterRoutes(r chi.Router) {
	// Register theme endpoints if needed
}

func (p *ThemePackPlugin) SubscribeEvents(bus plugins.EventBus) {
}

func (p *ThemePackPlugin) GetThemes() []string {
	return p.availableThemes
}
