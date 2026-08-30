package runtime

import (
	"context"
	"sync"
)

// Lifecycle owns the process-scoped context and worker accounting for a
// runtime host. Transport and application compatibility code can register
// workers without carrying cancellation and WaitGroup fields themselves.
// Shutdown remains deterministic: Cancel prevents new work and Wait joins all
// registered workers.
type Lifecycle struct {
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func NewLifecycle(parent context.Context) *Lifecycle {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	return &Lifecycle{ctx: ctx, cancel: cancel}
}

func (l *Lifecycle) Context() context.Context {
	if l == nil {
		return context.Background()
	}
	return l.ctx
}

func (l *Lifecycle) Go(fn func(context.Context)) {
	if l == nil || fn == nil {
		return
	}
	l.wg.Add(1)
	go func() {
		defer l.wg.Done()
		fn(l.ctx)
	}()
}

func (l *Lifecycle) Cancel() {
	if l != nil && l.cancel != nil {
		l.cancel()
	}
}

func (l *Lifecycle) Wait() {
	if l != nil {
		l.wg.Wait()
	}
}
