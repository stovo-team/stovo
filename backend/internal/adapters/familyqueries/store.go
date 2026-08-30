// Package familyqueries adapts legacy Ent-backed family reads to the
// consumer-owned family query port.
package familyqueries

import (
	"context"
	"time"

	"stovo-messenger/backend/ent"
	featurefamily "stovo-messenger/backend/internal/features/family"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) ListActiveMembers(ctx context.Context, familyID, excludeRole string) ([]featurefamily.Member, error) {
	rows, err := s.repository.ListActiveFamilyMembers(ctx, familyID, excludeRole)
	if err != nil {
		return nil, err
	}
	members := make([]featurefamily.Member, 0, len(rows))
	for _, row := range rows {
		members = append(members, featurefamily.Member{ID: row.ID, FamilyID: row.FamilyID, Username: row.Username, DisplayName: row.DisplayName, Role: row.Role, IsActive: row.IsActive == 1, PublicKey: row.PublicKey, LastSeenAt: row.LastSeenAt, ProfileVisibility: row.ProfileVisibility, LastSeenVisibility: row.LastSeenVisibility, ReadReceiptsEnabled: row.ReadReceiptsEnabled, Email: row.Email, Bio: row.Bio, Timezone: row.Timezone, ProfilePhotoFileID: row.ProfilePhotoFileID, CreatedAt: row.CreatedAt, AudioCallSettings: row.AudioCallSettings})
	}
	return members, nil
}

func (s *Store) InviteByID(ctx context.Context, inviteID string) (featurefamily.Invite, error) {
	row, err := s.repository.InviteByID(ctx, inviteID)
	if err != nil {
		return featurefamily.Invite{}, err
	}
	return inviteFromEnt(row), nil
}

func (s *Store) InviteByTokenHash(ctx context.Context, tokenHash string) (featurefamily.Invite, error) {
	row, err := s.repository.InviteByTokenHash(ctx, tokenHash)
	if err != nil {
		return featurefamily.Invite{}, err
	}
	return inviteFromEnt(row), nil
}

func (s *Store) Get(ctx context.Context, familyID string) (featurefamily.Details, error) {
	row, err := s.repository.FamilyByID(ctx, familyID)
	if err != nil {
		return featurefamily.Details{}, err
	}
	result := featurefamily.Details{
		ID: row.ID, Name: row.Name,
		DefaultMessageEncryptionProtocol: row.DefaultMessageEncryptionProtocol,
		MinimizedChatLayout:              row.MinimizedChatLayout,
		PublicAppURL:                     row.PublicAppURL, PublicAPIURL: row.PublicAPIURL,
	}
	if row.StorageLimitMB != nil {
		limit := int64(*row.StorageLimitMB)
		result.StorageLimitMB = &limit
	}
	return result, nil
}

func inviteFromEnt(row *ent.Invite) featurefamily.Invite {
	invite := featurefamily.Invite{ID: row.ID, FamilyID: row.FamilyID, Role: row.Role, ExpiresAt: parseTime(row.ExpiresAt), MaxUses: row.MaxUses, UsedCount: row.UsedCount, CreatedBy: row.CreatedBy, CreatedAt: parseTime(row.CreatedAt)}
	if row.RevokedAt != nil {
		revoked := parseTime(*row.RevokedAt)
		invite.RevokedAt = &revoked
	}
	return invite
}

func parseTime(value string) time.Time {
	parsed, _ := time.Parse(time.RFC3339Nano, value)
	return parsed
}
