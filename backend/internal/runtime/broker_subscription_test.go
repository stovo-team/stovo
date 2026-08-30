package runtime

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"stovo-messenger/backend/internal/ports"
)

type retryingBroker struct {
	mu     sync.Mutex
	calls  int
	cancel context.CancelFunc
}

func (b *retryingBroker) Subscribe(_ context.Context, _ string, _ ports.EventHandler) error {
	b.mu.Lock()
	b.calls++
	calls := b.calls
	b.mu.Unlock()
	if calls == 2 {
		b.cancel()
		return context.Canceled
	}
	return errors.New("subscription lost")
}

func TestRunBrokerSubscriptionRetriesReportedFailures(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	broker := &retryingBroker{cancel: cancel}
	var reported []error
	RunBrokerSubscription(ctx, broker, "events:test", func(ports.Event) error { return nil }, time.Millisecond, func(err error) {
		reported = append(reported, err)
	})

	broker.mu.Lock()
	calls := broker.calls
	broker.mu.Unlock()
	if calls != 2 {
		t.Fatalf("subscription calls = %d, want 2", calls)
	}
	if len(reported) != 1 || reported[0].Error() != "subscription lost" {
		t.Fatalf("reported errors = %#v, want one subscription failure", reported)
	}
}

func TestRunBrokerSubscriptionStopsDuringRetryDelay(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	broker := &retryingBroker{cancel: func() {}}
	done := make(chan struct{})
	go func() {
		RunBrokerSubscription(ctx, broker, "events:test", func(ports.Event) error { return nil }, time.Hour, nil)
		close(done)
	}()
	time.Sleep(time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("subscription worker did not stop after cancellation")
	}
}
