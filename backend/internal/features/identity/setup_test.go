package identity

import (
	"context"
	"errors"
	"testing"
)

type setupStoreFake struct {
	initial, admin SetupCommand
	err            error
}

func (s *setupStoreFake) CompleteInitialSetup(_ context.Context, command SetupCommand) error {
	s.initial = command
	return s.err
}
func (s *setupStoreFake) CreateAdditionalAdmin(_ context.Context, command SetupCommand) error {
	s.admin = command
	return s.err
}

func TestSetupServiceDelegatesAtomicCommands(t *testing.T) {
	store := &setupStoreFake{}
	service := NewSetupService(store)
	command := SetupCommand{UserID: "user", FamilyID: "family", RefreshTokenID: "session"}
	if err := service.CompleteInitial(context.Background(), command); err != nil || store.initial.UserID != "user" {
		t.Fatalf("initial err=%v command=%+v", err, store.initial)
	}
	if err := service.CreateAdmin(context.Background(), command); err != nil || store.admin.FamilyID != "family" {
		t.Fatalf("admin err=%v command=%+v", err, store.admin)
	}
	store.err = errors.New("transaction failed")
	if err := service.CompleteInitial(context.Background(), command); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
