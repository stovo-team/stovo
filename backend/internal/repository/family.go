package repository

import (
	"context"

	"entgo.io/ent/dialect/sql"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/chat"
	"stovo-messenger/backend/ent/chatmember"
	"stovo-messenger/backend/ent/chatpreference"
	"stovo-messenger/backend/ent/invite"
	"stovo-messenger/backend/ent/user"
)

// FamilyByID loads a family by primary key.
func (s *Store) FamilyByID(ctx context.Context, familyID string) (*ent.Family, error) {
	return s.Client.Family.Get(ctx, familyID)
}

// UpdateFamilyParams holds optional family field updates.
type UpdateFamilyParams struct {
	Name                *string
	StorageLimitMB      *int64
	MinimizedChatLayout *bool
	UpdatedAt           string
}

// UpdateFamily applies partial updates to a family.
func (s *Store) UpdateFamily(ctx context.Context, familyID string, p UpdateFamilyParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		upd := tx.Family.UpdateOneID(familyID).SetUpdatedAt(p.UpdatedAt)
		if p.Name != nil {
			upd.SetName(*p.Name)
		}
		if p.StorageLimitMB != nil {
			upd.SetStorageLimitMB(int(*p.StorageLimitMB))
		}
		if p.MinimizedChatLayout != nil {
			upd.SetMinimizedChatLayout(*p.MinimizedChatLayout)
		}
		_, err := upd.Save(ctx)
		return err
	})
}

// ListActiveFamilyMembers returns active users in a family excluding the given role.
func (s *Store) ListActiveFamilyMembers(ctx context.Context, familyID, excludeRole string) ([]*ent.User, error) {
	return s.Client.User.Query().
		Where(
			user.FamilyIDEQ(familyID),
			user.IsActiveEQ(1),
			user.RoleNEQ(excludeRole),
		).
		Order(user.ByCreatedAt(sql.OrderAsc())).
		All(ctx)
}

// UpdateUserRole sets a user's role.
func (s *Store) UpdateUserRole(ctx context.Context, userID, role string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		_, err := tx.User.UpdateOneID(userID).SetRole(role).Save(ctx)
		return err
	})
}

// DeactivateUser sets is_active = 0.
func (s *Store) DeactivateUser(ctx context.Context, tx *ent.Tx, userID string) error {
	_, err := s.client(tx).User.UpdateOneID(userID).SetIsActive(0).Save(ctx)
	return err
}

// CreateInviteParams holds invite insert fields.
type CreateInviteParams struct {
	ID        string
	FamilyID  string
	TokenHash string
	Role      string
	ExpiresAt string
	MaxUses   int
	CreatedBy string
	CreatedAt string
}

// CreateInvite inserts an invite row.
func (s *Store) CreateInvite(ctx context.Context, tx *ent.Tx, p CreateInviteParams) error {
	_, err := s.client(tx).Invite.Create().
		SetID(p.ID).
		SetFamilyID(p.FamilyID).
		SetTokenHash(p.TokenHash).
		SetRole(p.Role).
		SetExpiresAt(p.ExpiresAt).
		SetMaxUses(p.MaxUses).
		SetUsedCount(0).
		SetCreatedBy(p.CreatedBy).
		SetCreatedAt(p.CreatedAt).
		Save(ctx)
	return err
}

// CreateInviteTx creates an invite in its own transaction.
func (s *Store) CreateInviteTx(ctx context.Context, p CreateInviteParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		return s.CreateInvite(ctx, tx, p)
	})
}

// InviteByID loads an invite by primary key.
func (s *Store) InviteByID(ctx context.Context, inviteID string) (*ent.Invite, error) {
	return s.Client.Invite.Get(ctx, inviteID)
}

// InviteByTokenHash loads an invite by token hash.
func (s *Store) InviteByTokenHash(ctx context.Context, tokenHash string) (*ent.Invite, error) {
	return s.Client.Invite.Query().
		Where(invite.TokenHashEQ(tokenHash)).
		Only(ctx)
}

// RevokeInvite sets revoked_at on an invite.
func (s *Store) RevokeInvite(ctx context.Context, inviteID, revokedAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		_, err := tx.Invite.UpdateOneID(inviteID).SetRevokedAt(revokedAt).Save(ctx)
		return err
	})
}

// FamilyChatID returns the family-type chat id for a family.
func (s *Store) FamilyChatID(ctx context.Context, familyID string) (string, error) {
	c, err := s.Client.Chat.Query().
		Where(
			chat.FamilyIDEQ(familyID),
			chat.TypeEQ("family"),
		).
		First(ctx)
	if err != nil {
		return "", err
	}
	return c.ID, nil
}

// AcceptInviteParams holds inputs for accepting an invite.
type AcceptInviteParams struct {
	UserID         string
	FamilyID       string
	Username       string
	PasswordHash   string
	DisplayName    string
	Role           string
	InviteID       string
	FamilyChatID   string
	RefreshTokenID string
	TokenHash      string
	ExpiresAt      string
	CreatedAt      string
	IPAddress      string
	ProfileVisibility string
	LastSeenVisibility string
	ReadReceiptsEnabled bool
}

// AcceptInvite creates the user, increments invite usage, joins family chat, and issues a refresh token.
func (s *Store) AcceptInvite(ctx context.Context, p AcceptInviteParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if _, err := tx.User.Create().
			SetID(p.UserID).
			SetFamilyID(p.FamilyID).
			SetUsername(p.Username).
			SetPasswordHash(p.PasswordHash).
			SetDisplayName(p.DisplayName).
			SetRole(p.Role).
			SetProfileVisibility(p.ProfileVisibility).
			SetLastSeenVisibility(p.LastSeenVisibility).
			SetReadReceiptsEnabled(p.ReadReceiptsEnabled).
			SetIsActive(1).
			SetCreatedAt(p.CreatedAt).
			Save(ctx); err != nil {
			return err
		}
		if _, err := tx.Invite.UpdateOneID(p.InviteID).AddUsedCount(1).Save(ctx); err != nil {
			return err
		}
		if err := tx.ChatMember.Create().
			SetID(p.FamilyChatID).
			SetUserID(p.UserID).
			SetCreatedAt(p.CreatedAt).
			OnConflictColumns(chatmember.FieldID, chatmember.FieldUserID).
			DoNothing().
			Exec(ctx); err != nil {
			return err
		}
		if err := tx.ChatPreference.Create().
			SetID(p.FamilyChatID).
			SetUserID(p.UserID).
			OnConflictColumns(chatpreference.FieldID, chatpreference.FieldUserID).
			DoNothing().
			Exec(ctx); err != nil {
			return err
		}
		return s.CreateRefreshToken(ctx, tx, CreateRefreshTokenParams{
			ID:        p.RefreshTokenID,
			UserID:    p.UserID,
			TokenHash: p.TokenHash,
			ExpiresAt: p.ExpiresAt,
			CreatedAt: p.CreatedAt,
			IPAddress: p.IPAddress,
		})
	})
}
