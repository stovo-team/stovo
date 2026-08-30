package http

import (
	"context"
	"errors"
	stdhttp "net/http"
	"sync"
	"testing"
	"time"
)

type lifecycleListener struct {
	serveStarted chan struct{}
	serveResult  chan error
	shutdownErr  error
	shutdowns    int
}

func (l *lifecycleListener) ListenAndServe() error {
	close(l.serveStarted)
	return <-l.serveResult
}

func (l *lifecycleListener) Shutdown(context.Context) error {
	l.shutdowns++
	select {
	case l.serveResult <- stdhttp.ErrServerClosed:
	default:
	}
	return l.shutdownErr
}

type lifecycleRuntime struct {
	err    error
	closes int
	mu     sync.Mutex
}

func (r *lifecycleRuntime) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.closes++
	return r.err
}

func TestRunShutsDownListenerBeforeRuntimeOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	listener := &lifecycleListener{serveStarted: make(chan struct{}), serveResult: make(chan error, 1)}
	runtime := &lifecycleRuntime{}
	result := make(chan error, 1)
	go func() { result <- Run(ctx, listener, runtime, time.Second) }()
	<-listener.serveStarted
	cancel()

	if err := <-result; err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if listener.shutdowns != 1 {
		t.Fatalf("shutdowns = %d, want 1", listener.shutdowns)
	}
	if runtime.closes != 1 {
		t.Fatalf("runtime closes = %d, want 1", runtime.closes)
	}
}

func TestRunClosesRuntimeAfterUnexpectedListenerFailure(t *testing.T) {
	listenerFailure := errors.New("listener failed")
	listener := &lifecycleListener{serveStarted: make(chan struct{}), serveResult: make(chan error, 1)}
	runtime := &lifecycleRuntime{}
	listener.serveResult <- listenerFailure

	err := Run(context.Background(), listener, runtime, time.Second)
	if !errors.Is(err, listenerFailure) {
		t.Fatalf("Run() error = %v, want listener failure", err)
	}
	if listener.shutdowns != 0 {
		t.Fatalf("shutdowns = %d, want 0", listener.shutdowns)
	}
	if runtime.closes != 1 {
		t.Fatalf("runtime closes = %d, want 1", runtime.closes)
	}
}

func TestRunTreatsNormalHTTPShutdownAsSuccess(t *testing.T) {
	listener := &lifecycleListener{serveStarted: make(chan struct{}), serveResult: make(chan error, 1)}
	runtime := &lifecycleRuntime{}
	listener.serveResult <- stdhttp.ErrServerClosed

	if err := Run(context.Background(), listener, runtime, time.Second); err != nil {
		t.Fatalf("Run() error = %v", err)
	}
}
