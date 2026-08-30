package family

import (
	"context"
	"time"
)

// InviteCreate contains the persistence-neutral values for a new family
// invitation. Token generation and URL rendering remain transport concerns.
type InviteCreate struct {
	ID, FamilyID, TokenHash, Role, CreatedBy string
	ExpiresAt                                time.Time
	MaxUses                                  int
	CreatedAt                                string
}

type InviteStore interface {
	CreateInvite(context.Context, InviteCreate) error
	RevokeInvite(context.Context, string, string) error
	AcceptInvite(context.Context, InviteAcceptance) error
}

type InviteService struct{ store InviteStore }

func NewInviteService(store InviteStore) *InviteService { return &InviteService{store: store} }

func (s *InviteService) Create(ctx context.Context, invite InviteCreate) error {
	return s.store.CreateInvite(ctx, invite)
}

func (s *InviteService) Revoke(ctx context.Context, inviteID, revokedAt string) error {
	return s.store.RevokeInvite(ctx, inviteID, revokedAt)
}

// InviteAcceptance groups the already-validated registration data that must
// be persisted with consuming an invitation and creating the refresh session.
type InviteAcceptance struct {
	UserID, FamilyID, Username, PasswordHash, DisplayName, Role string
	InviteID                                                    string
	RefreshTokenID, TokenHash, ExpiresAt, CreatedAt, IPAddress  string
	ProfileVisibility, LastSeenVisibility                       string
	ReadReceiptsEnabled                                         bool
}

func (s *InviteService) Accept(ctx context.Context, acceptance InviteAcceptance) error {
	return s.store.AcceptInvite(ctx, acceptance)
}
