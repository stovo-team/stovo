package http

import (
	"context"
	stdhttp "net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestSFUTokenHandler_CreateToken(t *testing.T) {
	t.Run("returns service unavailable when SFU is not configured", func(t *testing.T) {
		handler := NewSFUTokenHandler(SFUTokenOperations{
			IsSFUConfigured: func() bool { return false },
		})
		router := chi.NewRouter()
		router.Post("/api/calls/{roomId}/sfu-token", func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			handler.CreateToken(w, r, SFUTokenActor{ID: "user-1", DisplayName: "User 1"})
		})

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodPost, "/api/calls/room-1/sfu-token", nil))
		if recorder.Code != stdhttp.StatusServiceUnavailable {
			t.Fatalf("status = %d, want %d", recorder.Code, stdhttp.StatusServiceUnavailable)
		}
		if !strings.Contains(recorder.Body.String(), "SFU is not configured") {
			t.Fatalf("body = %s", recorder.Body.String())
		}
	})

	t.Run("returns token response on success", func(t *testing.T) {
		handler := NewSFUTokenHandler(SFUTokenOperations{
			IsSFUConfigured: func() bool { return true },
			CreateToken: func(ctx context.Context, roomID string, actor SFUTokenActor) (any, int, string) {
				return map[string]any{
					"token":    "test-sfu-token",
					"url":      "wss://sfu.example.com",
					"roomName": roomID,
					"roomId":   roomID,
					"chatId":   "chat-1",
				}, stdhttp.StatusOK, ""
			},
		})
		router := chi.NewRouter()
		router.Post("/api/calls/{roomId}/sfu-token", func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			handler.CreateToken(w, r, SFUTokenActor{ID: "user-1", DisplayName: "User 1"})
		})

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(stdhttp.MethodPost, "/api/calls/room-1/sfu-token", nil))
		if recorder.Code != stdhttp.StatusOK {
			t.Fatalf("status = %d, want %d", recorder.Code, stdhttp.StatusOK)
		}
		if !strings.Contains(recorder.Body.String(), "test-sfu-token") {
			t.Fatalf("body = %s", recorder.Body.String())
		}
	})
}
