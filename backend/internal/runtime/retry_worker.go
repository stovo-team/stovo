package runtime

import (
	"context"
	"time"
)

// RetryWorker owns cancellation, delay scheduling, and retry accounting for
// an outbound side effect. The adapter retains only the concrete delivery
// operation and optional observability callbacks.
type RetryWorker[T any] struct {
	Delays    []time.Duration
	MaxTries  int
	Deliver   func(context.Context, T) error
	Succeeded func(T, int)
	Exhausted func(T, int)
	Dropped   func(T)
}

func (w RetryWorker[T]) Run(ctx context.Context, queue chan T) {
	if w.Deliver == nil || queue == nil {
		return
	}
	if w.MaxTries <= 0 {
		w.MaxTries = 3
	}
	for {
		select {
		case <-ctx.Done():
			return
		case item := <-queue:
			for attempt := 0; attempt < w.MaxTries; attempt++ {
				delay := w.delay(attempt)
				if delay > 0 && !wait(ctx, delay) {
					return
				}
				retryCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
				err := w.Deliver(retryCtx, item)
				cancel()
				if err == nil {
					if w.Succeeded != nil {
						w.Succeeded(item, attempt+1)
					}
					break
				}
				if attempt+1 == w.MaxTries {
					if w.Exhausted != nil {
						w.Exhausted(item, attempt+1)
					}
					break
				}
				if ctx.Err() != nil {
					return
				}
			}
		}
	}
}

func (w RetryWorker[T]) delay(attempt int) time.Duration {
	if len(w.Delays) == 0 {
		return 0
	}
	if attempt >= len(w.Delays) {
		return w.Delays[len(w.Delays)-1]
	}
	return w.Delays[attempt]
}
