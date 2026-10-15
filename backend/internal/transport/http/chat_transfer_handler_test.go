package http

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"stovo-messenger/backend/internal/features/chattransfer"
)

func TestChatTransferImportRequiresIdempotencyKey(t *testing.T) {
	called := false
	handler := NewChatTransferHandler(ChatTransferOperations{Import: func(context.Context, string, chattransfer.Archive, map[string]chattransfer.StoredMessageContent) (any, int, error) {
		called = true
		return nil, 0, nil
	}})
	recorder := httptest.NewRecorder()
	handler.Import(recorder, httptest.NewRequest(http.MethodPost, "/api/chat-imports", bytes.NewBufferString(`{"archive":{}}`)))
	if recorder.Code != http.StatusBadRequest || called {
		t.Fatalf("status=%d called=%v", recorder.Code, called)
	}
}

func TestChatTransferImportRejectsMalformedJSON(t *testing.T) {
	called := false
	handler := NewChatTransferHandler(ChatTransferOperations{Import: func(context.Context, string, chattransfer.Archive, map[string]chattransfer.StoredMessageContent) (any, int, error) {
		called = true
		return nil, 0, nil
	}})
	request := httptest.NewRequest(http.MethodPost, "/api/chat-imports", bytes.NewBufferString(`{"archive":`))
	request.Header.Set("Idempotency-Key", "operation-1")
	recorder := httptest.NewRecorder()
	handler.Import(recorder, request)
	if recorder.Code != http.StatusBadRequest || called {
		t.Fatalf("status=%d called=%v", recorder.Code, called)
	}
}

func TestChatTransferImportRejectsOversizedDeclaredBody(t *testing.T) {
	called := false
	handler := NewChatTransferHandler(ChatTransferOperations{Import: func(context.Context, string, chattransfer.Archive, map[string]chattransfer.StoredMessageContent) (any, int, error) {
		called = true
		return nil, 0, nil
	}})
	request := httptest.NewRequest(http.MethodPost, "/api/chat-imports", bytes.NewBufferString(`{}`))
	request.Header.Set("Idempotency-Key", "operation-1")
	request.ContentLength = maxChatImportRequestBytes + 1
	recorder := httptest.NewRecorder()
	handler.Import(recorder, request)
	if recorder.Code != http.StatusRequestEntityTooLarge || called {
		t.Fatalf("status=%d called=%v", recorder.Code, called)
	}
}

func TestChatTransferImportPassesArchiveAndIdempotencyKey(t *testing.T) {
	hello := "hello"
	archive := chattransfer.Archive{
		SchemaVersion: chattransfer.SchemaVersion,
		Source:        chattransfer.Source{ProviderID: "telegram", ProfileID: "telegram-desktop-json"},
		Conversation:  chattransfer.Conversation{Title: "Planning"},
		Participants:  []chattransfer.Participant{{SourceID: "person", DisplayName: "Mira"}},
		Messages:      []chattransfer.Message{{SourceID: "message", AuthorID: "person", Timestamp: time.Date(2026, 10, 10, 8, 0, 0, 0, time.UTC), Kind: "text", Text: &hello}},
	}
	body, err := json.Marshal(map[string]any{"archive": archive})
	if err != nil {
		t.Fatal(err)
	}
	called := false
	handler := NewChatTransferHandler(ChatTransferOperations{Import: func(_ context.Context, key string, got chattransfer.Archive, _ map[string]chattransfer.StoredMessageContent) (any, int, error) {
		called = key == "operation-1" && got.Conversation.Title == "Planning" && got.Messages[0].Text != nil && *got.Messages[0].Text == "hello"
		return map[string]string{"id": "chat-1"}, http.StatusCreated, nil
	}})
	request := httptest.NewRequest(http.MethodPost, "/api/chat-imports", bytes.NewReader(body))
	request.Header.Set("Idempotency-Key", "operation-1")
	recorder := httptest.NewRecorder()
	handler.Import(recorder, request)
	if recorder.Code != http.StatusCreated || !called {
		t.Fatalf("status=%d called=%v body=%s", recorder.Code, called, recorder.Body.String())
	}
}

func TestChatTransferExportSourcePassesSelectedChatID(t *testing.T) {
	called := ""
	handler := NewChatTransferHandler(ChatTransferOperations{ExportSource: func(_ context.Context, chatID string) (any, error) {
		called = chatID
		return map[string]string{"chatId": chatID}, nil
	}})
	router := chi.NewRouter()
	router.Get("/api/chats/{chatId}/transfer-source", handler.GetSource)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/chats/chat-42/transfer-source", nil))
	if recorder.Code != http.StatusOK || called != "chat-42" || recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("status=%d chatID=%q cache=%q", recorder.Code, called, recorder.Header().Get("Cache-Control"))
	}
}
