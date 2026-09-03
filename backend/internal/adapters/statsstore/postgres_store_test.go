package statsstore

import (
	"testing"
	"time"
)

func TestPostgresStoreMemoryTracking(t *testing.T) {
	store := NewPostgresStore(nil)
	if store == nil {
		t.Fatal("expected non-nil store")
	}

	// Test recording message in memory cache
	now := time.Now().UTC()
	store.mu.Lock()
	store.lastChat["chat-1"] = lastChatMessage{
		senderID:  "user-1",
		createdAt: now.Add(-30 * time.Second),
	}
	store.mu.Unlock()

	store.mu.RLock()
	last := store.lastChat["chat-1"]
	store.mu.RUnlock()

	if last.senderID != "user-1" {
		t.Errorf("got senderID %s; want user-1", last.senderID)
	}
}
