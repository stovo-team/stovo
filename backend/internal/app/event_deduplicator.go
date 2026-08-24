package app

import (
	"strings"
	"sync"
	"time"
)

const defaultEventDeduplicationTTL = 2 * time.Minute

// EventDeduplicator owns the short-lived event IDs used to suppress duplicate
// realtime deliveries. It is safe for concurrent broker consumers.
type EventDeduplicator struct {
	mu    sync.Locker
	seen  map[string]time.Time
	ttl   time.Duration
	now   func() time.Time
}

func NewEventDeduplicator() *EventDeduplicator {
	return newEventDeduplicator(&sync.Mutex{}, make(map[string]time.Time), defaultEventDeduplicationTTL, time.Now)
}

func newEventDeduplicator(mu sync.Locker, seen map[string]time.Time, ttl time.Duration, now func() time.Time) *EventDeduplicator {
	return &EventDeduplicator{mu: mu, seen: seen, ttl: ttl, now: now}
}

// Seen reports whether eventID was observed within the retention window, and
// records unseen IDs. Empty IDs are deliberately not deduplicated.
func (d *EventDeduplicator) Seen(eventID string) bool {
	eventID = strings.TrimSpace(eventID)
	if eventID == "" {
		return false
	}

	now := d.now().UTC()
	cutoff := now.Add(-d.ttl)
	d.mu.Lock()
	defer d.mu.Unlock()
	for id, seenAt := range d.seen {
		if seenAt.Before(cutoff) {
			delete(d.seen, id)
		}
	}
	if _, exists := d.seen[eventID]; exists {
		return true
	}
	d.seen[eventID] = now
	return false
}

func (s *Server) eventDeduplicator() *EventDeduplicator {
	return s.events
}
