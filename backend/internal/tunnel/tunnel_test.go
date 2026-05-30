package tunnel

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestMonitorLocalTunnelHealthRecoversOnSuccess(t *testing.T) {
	manager := NewManager()
	manager.ConfigureLocalTunnelHealth(func(_ string) error { return nil }, 5*time.Millisecond, 3)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	stopCalled := atomic.Bool{}
	restartReason := ""
	go manager.monitorLocalTunnelHealth(ctx, "https://ok.loca.lt", func() { stopCalled.Store(true) }, &restartReason)

	time.Sleep(20 * time.Millisecond)
	cancel()
	time.Sleep(10 * time.Millisecond)

	snapshot := manager.Status()
	if snapshot.HealthStatus != "healthy" {
		t.Fatalf("expected healthy status, got %s", snapshot.HealthStatus)
	}
	if snapshot.HealthFailureStreak != 0 {
		t.Fatalf("expected healthFailureStreak=0, got %d", snapshot.HealthFailureStreak)
	}
	if stopCalled.Load() {
		t.Fatalf("expected monitor to not stop tunnel")
	}
	if restartReason != "" {
		t.Fatalf("expected empty restart reason, got %q", restartReason)
	}
}

func TestMonitorLocalTunnelHealthTriggersRestartOnRepeatedFailures(t *testing.T) {
	manager := NewManager()
	manager.ConfigureLocalTunnelHealth(func(_ string) error { return errors.New("502 bad gateway") }, 5*time.Millisecond, 2)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	stopCalled := atomic.Bool{}
	restartReason := ""
	done := make(chan struct{})
	go func() {
		manager.monitorLocalTunnelHealth(ctx, "https://broken.loca.lt", func() { stopCalled.Store(true) }, &restartReason)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(200 * time.Millisecond):
		t.Fatal("timed out waiting for health monitor to request restart")
	}

	snapshot := manager.Status()
	if snapshot.HealthStatus != "degraded" {
		t.Fatalf("expected degraded status, got %s", snapshot.HealthStatus)
	}
	if snapshot.HealthFailureStreak < 2 {
		t.Fatalf("expected failure streak >= 2, got %d", snapshot.HealthFailureStreak)
	}
	if !stopCalled.Load() {
		t.Fatalf("expected monitor to stop tunnel after repeated failures")
	}
	if restartReason == "" {
		t.Fatalf("expected restart reason to be set")
	}
}
