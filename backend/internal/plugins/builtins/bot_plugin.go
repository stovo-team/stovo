package builtins

import (
	"context"
	"fmt"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/plugins"
)

type BotPlugin struct {
	welcomeCount int
}

func NewBotPlugin() *BotPlugin {
	return &BotPlugin{}
}

func (p *BotPlugin) ID() string {
	return "plugin-system-welcome-bot"
}

func (p *BotPlugin) Name() string {
	return "System Welcome Bot"
}

func (p *BotPlugin) Init(services plugins.Services) error {
	return nil
}

func (p *BotPlugin) RegisterRoutes(r chi.Router) {
	// Expose bot status endpoint if needed
}

func (p *BotPlugin) SubscribeEvents(bus plugins.EventBus) {
	bus.Subscribe(plugins.EventUserJoined, func(ctx context.Context, event plugins.Event) error {
		p.welcomeCount++
		userID, _ := event.Payload["user_id"].(string)
		fmt.Printf("[WelcomeBot] Sending welcome message to user %s (Total welcomed: %d)\n", userID, p.welcomeCount)
		return nil
	})
}
