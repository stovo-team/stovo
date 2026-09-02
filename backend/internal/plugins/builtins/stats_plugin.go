package builtins

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/adapters/statsstore"
	"stovo-messenger/backend/internal/plugins"
)

type StatsPlugin struct {
	store *statsstore.PostgresStore
}

func NewStatsPlugin(store *statsstore.PostgresStore) *StatsPlugin {
	return &StatsPlugin{
		store: store,
	}
}

func (p *StatsPlugin) ID() string {
	return "plugin-rich-stats"
}

func (p *StatsPlugin) Name() string {
	return "Rich Chats & Server Statistics"
}

func (p *StatsPlugin) Init(services plugins.Services) error {
	if p.store == nil {
		if store, ok := services.StatsStore.(*statsstore.PostgresStore); ok {
			p.store = store
		}
	}
	if p.store != nil {
		_ = p.store.InitSchema(context.Background())
	}
	return nil
}

func (p *StatsPlugin) RegisterRoutes(r chi.Router) {
	r.Route("/stats", func(sub chi.Router) {
		sub.Get("/overview", p.handleOverview)
		sub.Get("/chats/{chatId}", p.handleChatStats)
		sub.Get("/fun-awards", p.handleFunAwards)
		sub.Get("/wrapped/{year}", p.handleYearWithStovo)
	})
}

func (p *StatsPlugin) SubscribeEvents(bus plugins.EventBus) {
	bus.Subscribe(plugins.EventMessageSent, func(ctx context.Context, event plugins.Event) error {
		if p.store == nil {
			return nil
		}
		chatID, _ := event.Payload["chat_id"].(string)
		senderID, _ := event.Payload["sender_id"].(string)
		msgType, _ := event.Payload["type"].(string)
		content, _ := event.Payload["content"].(string)
		t := event.Timestamp
		if t.IsZero() {
			t = time.Now().UTC()
		}
		p.store.RecordMessage(ctx, chatID, senderID, msgType, content, t)
		return nil
	})

	bus.Subscribe(plugins.EventReactionAdded, func(ctx context.Context, event plugins.Event) error {
		if p.store == nil {
			return nil
		}
		chatID, _ := event.Payload["chat_id"].(string)
		messageID, _ := event.Payload["message_id"].(string)
		userID, _ := event.Payload["user_id"].(string)
		reaction, _ := event.Payload["reaction"].(string)
		t := event.Timestamp
		if t.IsZero() {
			t = time.Now().UTC()
		}
		p.store.RecordReaction(ctx, chatID, messageID, userID, reaction, t)
		return nil
	})
}

func (p *StatsPlugin) handleOverview(w http.ResponseWriter, r *http.Request) {
	if p.store == nil {
		http.Error(w, `{"error":"stats store unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	rangeFilter := r.URL.Query().Get("range")
	overview, err := p.store.GetServerOverview(r.Context(), rangeFilter)
	if err != nil {
		http.Error(w, `{"error":"failed to load stats"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(overview)
}

func (p *StatsPlugin) handleChatStats(w http.ResponseWriter, r *http.Request) {
	if p.store == nil {
		http.Error(w, `{"error":"stats store unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	chatID := chi.URLParam(r, "chatId")
	if chatID == "" {
		http.Error(w, `{"error":"missing chatId"}`, http.StatusBadRequest)
		return
	}
	stats, err := p.store.GetChatStats(r.Context(), chatID)
	if err != nil {
		http.Error(w, `{"error":"failed to load chat stats"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
}

func (p *StatsPlugin) handleFunAwards(w http.ResponseWriter, r *http.Request) {
	if p.store == nil {
		http.Error(w, `{"error":"stats store unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	awards, err := p.store.GetFunAwards(r.Context())
	if err != nil {
		http.Error(w, `{"error":"failed to load fun awards"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(awards)
}

func (p *StatsPlugin) handleYearWithStovo(w http.ResponseWriter, r *http.Request) {
	if p.store == nil {
		http.Error(w, `{"error":"stats store unavailable"}`, http.StatusServiceUnavailable)
		return
	}
	yearStr := chi.URLParam(r, "year")
	year, err := strconv.Atoi(yearStr)
	if err != nil || year < 2000 || year > 2100 {
		year = time.Now().Year()
	}

	userID := r.URL.Query().Get("userId")
	wrapped, err := p.store.GetYearWithStovo(r.Context(), year, userID)
	if err != nil {
		http.Error(w, `{"error":"failed to generate year with stovo"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(wrapped)
}
