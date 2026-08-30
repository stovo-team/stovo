// Package familyinvites adapts the legacy Ent repository to the family-owned
// invite command port.
package familyinvites

import (
	"context"
	"time"

	featurefamily "stovo-messenger/backend/internal/features/family"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) CreateInvite(ctx context.Context, invite featurefamily.InviteCreate) error {
	return s.repository.CreateInviteTx(ctx, repository.CreateInviteParams{
		ID: invite.ID, FamilyID: invite.FamilyID, TokenHash: invite.TokenHash, Role: invite.Role,
		ExpiresAt: invite.ExpiresAt.UTC().Format(time.RFC3339Nano),
		MaxUses:   invite.MaxUses, CreatedBy: invite.CreatedBy, CreatedAt: invite.CreatedAt,
	})
}

func (s *Store) RevokeInvite(ctx context.Context, inviteID, revokedAt string) error {
	return s.repository.RevokeInvite(ctx, inviteID, revokedAt)
}

func (s *Store) AcceptInvite(ctx context.Context, acceptance featurefamily.InviteAcceptance) error {
	familyChatID, err := s.repository.FamilyChatID(ctx, acceptance.FamilyID)
	if err != nil {
		return err
	}
	return s.repository.AcceptInvite(ctx, repository.AcceptInviteParams{
		UserID: acceptance.UserID, FamilyID: acceptance.FamilyID, Username: acceptance.Username,
		PasswordHash: acceptance.PasswordHash, DisplayName: acceptance.DisplayName, Role: acceptance.Role,
		InviteID: acceptance.InviteID, FamilyChatID: familyChatID, RefreshTokenID: acceptance.RefreshTokenID,
		TokenHash: acceptance.TokenHash, ExpiresAt: acceptance.ExpiresAt, CreatedAt: acceptance.CreatedAt,
		IPAddress: acceptance.IPAddress, ProfileVisibility: acceptance.ProfileVisibility,
		LastSeenVisibility: acceptance.LastSeenVisibility, ReadReceiptsEnabled: acceptance.ReadReceiptsEnabled,
	})
}
