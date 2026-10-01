package app

import (
	"context"
	"errors"
	"strings"
	"testing"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

func TestCreateChatRejectsTypesDisabledBySupervisor(t *testing.T) {
	t.Setenv("CHAT_TYPES", `{"direct":true,"group":false,"channel":true,"voice":true}`)

	_, status, err := (&Server{}).createChat(context.Background(), userPublic{}, "group", httptransport.ChatCreateRequest{})
	var restricted statusError
	if !errors.As(err, &restricted) || restricted.Status != 403 {
		t.Fatalf("createChat error = %v (status return %d), want status error 403", err, status)
	}
	if err == nil || !strings.Contains(err.Error(), "disabled by the supervisor") {
		t.Fatalf("createChat error = %v, want supervisor restriction", err)
	}
}
