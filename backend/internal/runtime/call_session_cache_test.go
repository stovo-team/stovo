package runtime

import (
	"context"
	"errors"
	"testing"
	"time"
)

type memoryCallSessionCache struct{ values map[string][]byte }

func (m *memoryCallSessionCache) Save(_ context.Context, key string, value []byte, _ time.Duration) error {
	if m.values == nil {
		m.values = map[string][]byte{}
	}
	m.values[key] = append([]byte(nil), value...)
	return nil
}
func (m *memoryCallSessionCache) Load(_ context.Context, key string) ([]byte, bool, error) {
	v, ok := m.values[key]
	return append([]byte(nil), v...), ok, nil
}
func (m *memoryCallSessionCache) Delete(_ context.Context, key string) error {
	delete(m.values, key)
	return nil
}

func TestCallSessionSnapshotsStoresBothStableKeys(t *testing.T) {
	cache := &memoryCallSessionCache{}
	type snapshot struct {
		ID string `json:"id"`
	}
	snapshots := CallSessionSnapshots[snapshot]{Cache: cache, Key: func(id string) string { return "call:" + id }}
	snapshots.Save(context.Background(), snapshot{ID: "room-1"}, "room-1", "chat-1", time.Minute)
	for _, id := range []string{"room-1", "chat-1"} {
		value, ok := snapshots.Load(context.Background(), id)
		if !ok || value.ID != "room-1" {
			t.Fatalf("Load(%q) = %#v, %v", id, value, ok)
		}
	}
	snapshots.Delete(context.Background(), "room-1")
	if _, ok := snapshots.Load(context.Background(), "room-1"); ok {
		t.Fatal("room snapshot remained after delete")
	}
}

type failingCallSessionCache struct{}

func (failingCallSessionCache) Save(context.Context, string, []byte, time.Duration) error {
	return errors.New("save")
}
func (failingCallSessionCache) Load(context.Context, string) ([]byte, bool, error) {
	return nil, false, errors.New("load")
}
func (failingCallSessionCache) Delete(context.Context, string) error { return errors.New("delete") }

func TestCallSessionSnapshotsReportsCacheErrors(t *testing.T) {
	var operations []string
	snapshots := CallSessionSnapshots[struct{}]{Cache: failingCallSessionCache{}, OnError: func(operation string, _ error) { operations = append(operations, operation) }}
	snapshots.Save(context.Background(), struct{}{}, "room", "", time.Minute)
	snapshots.Load(context.Background(), "room")
	snapshots.Delete(context.Background(), "room")
	if len(operations) != 3 {
		t.Fatalf("operations=%v", operations)
	}
}
