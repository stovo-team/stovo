package app

import (
	"context"
	"strings"
	"testing"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

func TestCreateChatRejectsTypesDisabledBySupervisor(t *testing.T) {
	t.Setenv("CHAT_TYPES", `{"direct":true,"group":false,"channel":true,"voice":true}`)

	_, status, err := (&Server{}).createChat(context.Background(), userPublic{}, "group", httptransport.ChatCreateRequest{})
	if status != 403 {
		t.Fatalf("createChat status = %d, want 403", status)
	}
	if err == nil || !strings.Contains(err.Error(), "disabled by the supervisor") {
		t.Fatalf("createChat error = %v, want supervisor restriction", err)
	}
}
