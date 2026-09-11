package http

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestMessageHistoryHandlerPassesArchiveGroup(t *testing.T) {
	var gotGroup string
	handler := NewMessageHistoryHandler(MessageHistoryOperations{
		List: func(_ context.Context, chatID, before string, limit int, threadRootMessageID, archiveGroup string) (any, error) {
			if chatID != "archive-1" || before != "cursor" || limit != 50 || threadRootMessageID != "" {
				t.Fatalf("unexpected history request: chat=%q before=%q limit=%d thread=%q", chatID, before, limit, threadRootMessageID)
			}
			gotGroup = archiveGroup
			return map[string]bool{"ok": true}, nil
		},
	})
	router := chi.NewRouter()
	router.Get("/api/chats/{chatId}/messages", handler.Get)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/chats/archive-1/messages?before=cursor&limit=50&archiveGroup=notes", nil))
	if recorder.Code != http.StatusOK || gotGroup != "notes" {
		t.Fatalf("status=%d archiveGroup=%q, want status=%d archiveGroup=%q", recorder.Code, gotGroup, http.StatusOK, "notes")
	}
}
