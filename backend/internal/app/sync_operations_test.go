package app

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNewCreatedMessagePublicSerializesEmptyAttachmentsAsArray(t *testing.T) {
	message := newCreatedMessagePublic(
		"message-1",
		"chat-1",
		userPublic{ID: "user-1", DisplayName: "User"},
		"text",
		nil,
		encryptionProtocolLegacyPlain,
		nil,
		nil,
		nil,
		nil,
		sendMessageRequest{},
		"chat",
		nil,
		nil,
		time.Now(),
	)

	body, err := json.Marshal(message)
	if err != nil {
		t.Fatalf("marshal message: %v", err)
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode message: %v", err)
	}
	if got := string(payload["attachments"]); got != "[]" {
		t.Fatalf("attachments JSON = %s, want []", got)
	}
}
