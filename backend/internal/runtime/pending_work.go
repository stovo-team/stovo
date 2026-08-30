package runtime

import (
	"context"
	"time"
)

// PendingWork describes a process-lifetime task that must wait for clients to
// finish committing work before it can run. It keeps retry/poll coordination in
// runtime while the caller retains the feature-specific pending check and job.
type PendingWork struct {
	InitialDelay time.Duration
	PollInterval time.Duration
	MaxPolls     int
	Pending      func(context.Context) (int, error)
	Run          func(context.Context)
}

// StartPendingWork starts PendingWork without coupling a feature to goroutine
// and timer management. The supplied context controls both waiting and work.
func StartPendingWork(ctx context.Context, work PendingWork) {
	go RunPendingWork(ctx, work)
}

// RunPendingWork waits for an optional settling period, then polls while work
// remains pending. A pending-check error deliberately stops waiting so a
// transient backing-service failure cannot prevent the job forever.
func RunPendingWork(ctx context.Context, work PendingWork) {
	if work.Run == nil {
		return
	}
	if !wait(ctx, work.InitialDelay) {
		return
	}
	for attempt := 0; attempt < work.MaxPolls && work.Pending != nil; attempt++ {
		pending, err := work.Pending(ctx)
		if err != nil || pending == 0 {
			break
		}
		if !wait(ctx, work.PollInterval) {
			return
		}
	}
	if ctx.Err() == nil {
		work.Run(ctx)
	}
}

func wait(ctx context.Context, duration time.Duration) bool {
	if duration <= 0 {
		return ctx.Err() == nil
	}
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
