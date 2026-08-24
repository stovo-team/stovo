package app

import (
	"sync"
	"testing"
	"time"
)

func TestEventDeduplicatorRecordsAndExpiresEvents(t *testing.T) {
	now := time.Date(2026, time.August, 24, 12, 0, 0, 0, time.UTC)
	deduplicator := newEventDeduplicator(&sync.Mutex{}, make(map[string]time.Time), time.Minute, func() time.Time { return now })

	if deduplicator.Seen(" event-1 ") {
		t.Fatal("first event should not be marked as seen")
	}
	if !deduplicator.Seen("event-1") {
		t.Fatal("second event should be marked as seen")
	}
	if deduplicator.Seen("  ") {
		t.Fatal("empty event IDs must not be deduplicated")
	}

	now = now.Add(time.Minute + time.Nanosecond)
	if deduplicator.Seen("event-1") {
		t.Fatal("expired event should be accepted again")
	}
}

func TestEventDeduplicatorPrunesExpiredEvents(t *testing.T) {
	now := time.Date(2026, time.August, 24, 12, 0, 0, 0, time.UTC)
	seen := map[string]time.Time{
		"expired": now.Add(-2 * time.Minute),
		"recent":  now.Add(-30 * time.Second),
	}
	deduplicator := newEventDeduplicator(&sync.Mutex{}, seen, time.Minute, func() time.Time { return now })

	if deduplicator.Seen("recent") != true {
		t.Fatal("recent event should remain deduplicated")
	}
	if _, exists := seen["expired"]; exists {
		t.Fatal("expired event was not pruned")
	}
}
