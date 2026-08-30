package runtime

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestRetryWorkerRetriesUntilSuccess(t *testing.T) {
	queue := make(chan string, 1)
	queue <- "event"
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var attempts atomic.Int32
	done := make(chan struct{}, 1)
	worker := RetryWorker[string]{
		MaxTries: 3,
		Deliver: func(context.Context, string) error {
			if attempts.Add(1) < 3 {
				return errors.New("temporary")
			}
			return nil
		},
		Succeeded: func(_ string, attempt int) {
			if attempt != 3 {
				t.Errorf("attempt=%d", attempt)
			}
			done <- struct{}{}
		},
	}
	go worker.Run(ctx, queue)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("worker did not succeed")
	}
	if got := attempts.Load(); got != 3 {
		t.Fatalf("attempts=%d", got)
	}
}
