package presenter

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWriteChatUsesStableContentTypeAndFields(t *testing.T) {
	recorder := httptest.NewRecorder()
	WriteChat(recorder, http.StatusOK, Chat{ID: "chat-1", FamilyID: "family-1", Type: "group"})

	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("content type = %q, want application/json", got)
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	for _, field := range []string{`"id":"chat-1"`, `"familyId":"family-1"`, `"type":"group"`} {
		if !strings.Contains(recorder.Body.String(), field) {
			t.Fatalf("response missing %s: %s", field, recorder.Body.String())
		}
	}
}

func TestWriteChatsPreservesArrayResponse(t *testing.T) {
	recorder := httptest.NewRecorder()
	WriteChats(recorder, http.StatusOK, []Chat{{ID: "chat-1"}})
	if !strings.HasPrefix(recorder.Body.String(), "[") {
		t.Fatalf("chat list must serialize as array: %s", recorder.Body.String())
	}
}
