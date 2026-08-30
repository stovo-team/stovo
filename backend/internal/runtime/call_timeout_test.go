package runtime

import (
	"context"
	"testing"
	"time"
)

func TestRunCallTimeoutRunsAtPastDeadline(t *testing.T) {
	ran := make(chan struct{}, 1)
	RunCallTimeout(context.Background(), CallTimeout{
		ExpiresAt: time.Now().Add(-time.Second),
		Run:       func(context.Context) { ran <- struct{}{} },
	})
	select {
	case <-ran:
	default:
		t.Fatal("timeout callback did not run")
	}
}

func TestRunCallTimeoutHonorsCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	ran := false
	RunCallTimeout(ctx, CallTimeout{
		ExpiresAt: time.Now().Add(time.Hour),
		Run:       func(context.Context) { ran = true },
	})
	if ran {
		t.Fatal("timeout callback ran after cancellation")
	}
}
