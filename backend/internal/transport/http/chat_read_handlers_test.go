package http

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"stovo-messenger/backend/internal/transport/http/presenter"

	"github.com/go-chi/chi/v5"
)

func TestChatReadHandlerListWritesStableChatArray(t *testing.T) {
	handler := NewChatReadHandler(ChatReadOperations{
		List: func(context.Context) ([]presenter.Chat, error) {
			return []presenter.Chat{{ID: "chat-1"}}, nil
		},
	})
	recorder := httptest.NewRecorder()
	handler.ListChats(recorder, httptest.NewRequest(http.MethodGet, "/api/chats", nil))

	if recorder.Code != http.StatusOK || !strings.HasPrefix(recorder.Body.String(), "[") {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestChatReadHandlerGetMapsMissingToExistingContract(t *testing.T) {
	missing := errors.New("missing")
	handler := NewChatReadHandler(ChatReadOperations{
		Get:       func(context.Context, string) (presenter.Chat, error) { return presenter.Chat{}, missing },
		IsMissing: func(err error) bool { return errors.Is(err, missing) },
	})
	router := chi.NewRouter()
	router.Get("/api/chats/{chatId}", handler.GetChat)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/chats/chat-1", nil))

	if recorder.Code != http.StatusNotFound || !strings.Contains(recorder.Body.String(), `"detail":"Chat not found"`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestChatReadHandlerGetMapsUnexpectedErrorToExistingContract(t *testing.T) {
	handler := NewChatReadHandler(ChatReadOperations{
		Get: func(context.Context, string) (presenter.Chat, error) { return presenter.Chat{}, errors.New("down") },
	})
	router := chi.NewRouter()
	router.Get("/api/chats/{chatId}", handler.GetChat)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/chats/chat-1", nil))

	if recorder.Code != http.StatusInternalServerError || !strings.Contains(recorder.Body.String(), `"detail":"Could not load chat"`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}
