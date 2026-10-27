package http

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func chatUpdateRequest(body string, update func(context.Context, string, ChatUpdateRequest) (any, int, error)) *httptest.ResponseRecorder {
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("chatId", "chat-1")
	request := httptest.NewRequest("PATCH", "/api/chats/chat-1", strings.NewReader(body))
	request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
	recorder := httptest.NewRecorder()
	NewChatMutationHandler(ChatMutationOperations{Update: update}).Update(recorder, request)
	return recorder
}

func TestChatMutationHandlerCarriesAndValidatesAvatarChoices(t *testing.T) {
	called := false
	recorder := chatUpdateRequest(`{"avatarMode":"symbol","avatarSymbolId":"megaphone","avatarColorId":"teal"}`, func(_ context.Context, chatID string, request ChatUpdateRequest) (any, int, error) {
		called = true
		if chatID != "chat-1" || request.AvatarMode == nil || *request.AvatarMode != "symbol" || request.AvatarSymbolID == nil || *request.AvatarSymbolID != "megaphone" || request.AvatarColorID == nil || *request.AvatarColorID != "teal" {
			t.Errorf("unexpected update request: id=%q payload=%+v", chatID, request)
		}
		return map[string]bool{"ok": true}, 200, nil
	})
	if !called || recorder.Code != 200 { t.Fatalf("update called=%v status=%d, want true and 200", called, recorder.Code) }

	called = false
	recorder = chatUpdateRequest(`{"avatarSymbolId":"<svg/>"}`, func(context.Context, string, ChatUpdateRequest) (any, int, error) { called = true; return nil, 200, nil })
	if called || recorder.Code != 422 { t.Fatalf("invalid symbol update called=%v status=%d, want false and 422", called, recorder.Code) }
}
