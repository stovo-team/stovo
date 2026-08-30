package identity

import (
	"context"
	"errors"
	"testing"
)

type setupStatusStoreFake struct {
	status SetupStatus
	err    error
}

func (f setupStatusStoreFake) LoadSetupStatus(context.Context) (SetupStatus, error) {
	return f.status, f.err
}

func TestSetupStatusServiceLoad(t *testing.T) {
	name := "Stovo"
	want := SetupStatus{ActiveUserCount: 2, FamilyName: &name}
	got, err := NewSetupStatusService(setupStatusStoreFake{status: want}).Load(context.Background())
	if err != nil || got.ActiveUserCount != want.ActiveUserCount || got.FamilyName == nil || *got.FamilyName != name {
		t.Fatalf("Load() = %#v, %v; want %#v, nil", got, err, want)
	}
}

func TestSetupStatusServiceLoadReturnsStoreError(t *testing.T) {
	want := errors.New("database unavailable")
	_, err := NewSetupStatusService(setupStatusStoreFake{err: want}).Load(context.Background())
	if !errors.Is(err, want) {
		t.Fatalf("Load() error = %v; want %v", err, want)
	}
}
