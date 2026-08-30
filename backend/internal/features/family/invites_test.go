package family

import (
	"context"
	"errors"
	"testing"
	"time"
)

type inviteStoreFake struct {
	created              InviteCreate
	revokedID, revokedAt string
	accepted             InviteAcceptance
	err                  error
}

func (s *inviteStoreFake) CreateInvite(_ context.Context, invite InviteCreate) error {
	s.created = invite
	return s.err
}
func (s *inviteStoreFake) RevokeInvite(_ context.Context, id, at string) error {
	s.revokedID, s.revokedAt = id, at
	return s.err
}
func (s *inviteStoreFake) AcceptInvite(_ context.Context, acceptance InviteAcceptance) error {
	s.accepted = acceptance
	return s.err
}

func TestInviteServiceDelegatesCommands(t *testing.T) {
	store := &inviteStoreFake{}
	service := NewInviteService(store)
	invite := InviteCreate{ID: "invite", FamilyID: "family", ExpiresAt: time.Now().UTC(), MaxUses: 2}
	if err := service.Create(context.Background(), invite); err != nil || store.created.ID != invite.ID {
		t.Fatalf("create err=%v invite=%+v", err, store.created)
	}
	if err := service.Revoke(context.Background(), "invite", "now"); err != nil || store.revokedID != "invite" || store.revokedAt != "now" {
		t.Fatalf("revoke err=%v id=%s at=%s", err, store.revokedID, store.revokedAt)
	}
	if err := service.Accept(context.Background(), InviteAcceptance{UserID: "user", InviteID: "invite"}); err != nil || store.accepted.UserID != "user" {
		t.Fatalf("accept err=%v acceptance=%+v", err, store.accepted)
	}
	store.err = errors.New("persistence failed")
	if err := service.Create(context.Background(), invite); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
