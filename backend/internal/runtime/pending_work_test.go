package runtime

import (
	"context"
	"testing"
	"time"
)

func TestRunPendingWorkWaitsForPendingWork(t *testing.T) {
	checks := 0
	ran := make(chan struct{}, 1)
	RunPendingWork(context.Background(), PendingWork{
		MaxPolls: 3,
		Pending: func(context.Context) (int, error) {
			checks++
			if checks < 3 {
				return 1, nil
			}
			return 0, nil
		},
		Run: func(context.Context) { ran <- struct{}{} },
	})
	select {
	case <-ran:
	case <-time.After(time.Second):
		t.Fatal("work did not run")
	}
	if checks != 3 {
		t.Fatalf("checks = %d, want 3", checks)
	}
}

func TestRunPendingWorkStopsOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	ran := false
	RunPendingWork(ctx, PendingWork{Run: func(context.Context) { ran = true }})
	if ran {
		t.Fatal("work ran after cancellation")
	}
}
