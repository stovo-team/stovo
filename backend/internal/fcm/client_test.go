package fcm

import (
	"context"
	"testing"
)

func TestUnconfiguredFCMClient(t *testing.T) {
	client, err := NewClient(context.Background(), "", "")
	if err != nil {
		t.Fatalf("expected nil err for empty credentials, got: %v", err)
	}
	if client.IsConfigured() {
		t.Fatalf("expected client to not be configured")
	}

	// Should safely no-op without error
	err = client.SendChatMessage(context.Background(), "test-token", "chat-1", "direct", "Alice", "Hello", 3, nil)
	if err != nil {
		t.Errorf("expected nil error on unconfigured SendChatMessage, got: %v", err)
	}

	err = client.SendCallRinging(context.Background(), "test-token", "chat-1", "Alice")
	if err != nil {
		t.Errorf("expected nil error on unconfigured SendCallRinging, got: %v", err)
	}

	err = client.SendCallMissed(context.Background(), "test-token", "chat-1", "Alice")
	if err != nil {
		t.Errorf("expected nil error on unconfigured SendCallMissed, got: %v", err)
	}
}
