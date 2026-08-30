package files

import (
	"context"
	"errors"
	"testing"
)

type lifecycleStoreFake struct {
	lifecycle Lifecycle
	err       error
}

func (s *lifecycleStoreFake) Lifecycle(context.Context, string) (Lifecycle, error) {
	return s.lifecycle, s.err
}

func TestLifecycleServiceOnlyReportsReadyFiles(t *testing.T) {
	store := &lifecycleStoreFake{lifecycle: Lifecycle{State: "ready"}}
	service := NewLifecycleService(store)
	if !service.Ready(context.Background(), "file") {
		t.Fatal("expected ready file")
	}
	store.lifecycle.State = "validating"
	if service.Ready(context.Background(), "file") {
		t.Fatal("did not expect validating file to be public")
	}
	store.err = errors.New("database unavailable")
	if service.Ready(context.Background(), "file") {
		t.Fatal("did not expect unavailable file to be public")
	}
}
