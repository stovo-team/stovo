package http

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestMessageReadHandlerPreservesReadContract(t *testing.T) {
	called := false
	h := NewMessageReadHandler(MessageReadOperations{
		Mark: func(_ context.Context, userID, messageID string) (any, string, error) {
			if userID != "user-1" || messageID != "message-1" {
				t.Fatalf("ids = %q %q", userID, messageID)
			}
			return map[string]string{"id": messageID}, "chat-1", nil
		},
		Published: func(_ context.Context, chatID, messageID, userID string) {
			called = chatID == "chat-1" && messageID == "message-1" && userID == "user-1"
		},
	})
	r := httptest.NewRequest(http.MethodPatch, "/api/messages/message-1/read", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("messageId", "message-1")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.MarkRead(w, r, "user-1")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"id":"message-1"`) || !called {
		t.Fatalf("status/body/published = %d %s %t", w.Code, w.Body.String(), called)
	}
}

func TestMessageReadHandlerMissingIsIdempotent(t *testing.T) {
	missing := errors.New("missing")
	h := NewMessageReadHandler(MessageReadOperations{Mark: func(context.Context, string, string) (any, string, error) { return nil, "", missing }, IsMissing: func(err error) bool { return errors.Is(err, missing) }})
	r := httptest.NewRequest(http.MethodPatch, "/", nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("messageId", "gone")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	w := httptest.NewRecorder()
	h.MarkRead(w, r, "user-1")
	if w.Code != http.StatusOK || w.Body.String() != "{\"status\":\"ok\"}\n" {
		t.Fatalf("response = %d %s", w.Code, w.Body.String())
	}
}
