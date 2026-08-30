package runtime

import (
	"context"
	"sync"
	"testing"
	"time"
)

type outboxStoreStub struct {
	event  OutboxEvent
	marked chan string
}

func (s *outboxStoreStub) Lease(context.Context, int, time.Duration) ([]OutboxEvent, error) {
	return []OutboxEvent{s.event}, nil
}
func (s *outboxStoreStub) MarkPublished(_ context.Context, id string) error {
	select {
	case s.marked <- id:
	default:
	}
	return nil
}

type publisherStub struct{ once sync.Once }

func (p *publisherStub) PublishJob(context.Context, OutboxEvent) error {
	p.once.Do(func() {})
	return nil
}

func TestRunOutboxDispatcherPublishesAndMarks(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store := &outboxStoreStub{event: OutboxEvent{ID: "event"}, marked: make(chan string, 1)}
	go RunOutboxDispatcher(ctx, time.Millisecond, time.Second, 1, store, &publisherStub{}, nil)
	select {
	case id := <-store.marked:
		if id != "event" {
			t.Fatalf("id=%q", id)
		}
	case <-time.After(time.Second):
		t.Fatal("not marked")
	}
}
