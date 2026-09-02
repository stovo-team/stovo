package builtins

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/adapters/statsstore"
	"stovo-messenger/backend/internal/plugins"
)

func TestStatsPluginMetadataAndRoutes(t *testing.T) {
	p := NewStatsPlugin(nil)
	if p.ID() != "plugin-rich-stats" {
		t.Errorf("got ID %s; want plugin-rich-stats", p.ID())
	}
	if p.Name() != "Rich Chats & Server Statistics" {
		t.Errorf("got Name %s; want Rich Chats & Server Statistics", p.Name())
	}

	r := chi.NewRouter()
	p.RegisterRoutes(r)

	// Since store is nil, should gracefully return 503
	req := httptest.NewRequest("GET", "/stats/overview", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected status 503 for nil store, got %d", rec.Code)
	}
}

func TestStatsPluginEvents(t *testing.T) {
	p := NewStatsPlugin(nil)
	bus := plugins.NewMemoryEventBus()
	p.SubscribeEvents(bus)

	// Publishing events should not panic even if store is nil
	bus.Publish(context.Background(), plugins.Event{
		Type:      plugins.EventMessageSent,
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"chat_id":   "c-1",
			"sender_id": "u-1",
			"type":      "text",
			"content":   "hello",
		},
	})

	bus.Publish(context.Background(), plugins.Event{
		Type:      plugins.EventReactionAdded,
		Timestamp: time.Now(),
		Payload: map[string]interface{}{
			"chat_id":    "c-1",
			"message_id": "m-1",
			"user_id":    "u-2",
			"reaction":   "❤️",
		},
	})
}
