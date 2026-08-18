package repository

import (
	"context"

	"family-messenger/backend/ent"
	"family-messenger/backend/ent/chat"
	"family-messenger/backend/ent/chatmember"
	"family-messenger/backend/ent/chatpreference"
	"family-messenger/backend/ent/refreshtoken"
	"family-messenger/backend/ent/user"
)

// Ping verifies database connectivity with the sole allowed application SQL probe.
func (s *Store) Ping(ctx context.Context) error {
	_, err := s.Client.User.Query().Limit(1).Count(ctx)
	return err
}

// CountActiveUsers returns the number of users with is_active = 1.
func (s *Store) CountActiveUsers(ctx context.Context) (int, error) {
	return s.Client.User.Query().Where(user.IsActiveEQ(1)).Count(ctx)
}

// SetupParams holds inputs for first-run family setup.
type SetupParams struct {
	FamilyID       string
	FamilyName     string
	UserID         string
	Username       string
	PasswordHash   string
	DisplayName    string
	Role           string
	ChatID         string
	ChatTitle      string
	RefreshTokenID string
	TokenHash      string
	ExpiresAt      string
	CreatedAt      string
	IPAddress      string
}

// CompleteSetup creates the initial family, owner, family chat, membership, and refresh token.
func (s *Store) CompleteSetup(ctx context.Context, p SetupParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if _, err := tx.Family.Create().
			SetID(p.FamilyID).
			SetName(p.FamilyName).
			SetCreatedAt(p.CreatedAt).
			SetUpdatedAt(p.CreatedAt).
			Save(ctx); err != nil {
			return err
		}
		if _, err := tx.User.Create().
			SetID(p.UserID).
			SetFamilyID(p.FamilyID).
			SetUsername(p.Username).
			SetPasswordHash(p.PasswordHash).
			SetDisplayName(p.DisplayName).
			SetRole(p.Role).
			SetIsActive(1).
			SetCreatedAt(p.CreatedAt).
			Save(ctx); err != nil {
			return err
		}
		if _, err := tx.Chat.Create().
			SetID(p.ChatID).
			SetFamilyID(p.FamilyID).
			SetType("family").
			SetTitle(p.ChatTitle).
			SetCreatedBy(p.UserID).
			SetMediaVisibility("family").
			SetEncryptionProtocol("end_to_end").
			SetCreatedAt(p.CreatedAt).
			SetUpdatedAt(p.CreatedAt).
			Save(ctx); err != nil {
			return err
		}
		if err := tx.ChatMember.Create().
			SetID(p.ChatID).
			SetUserID(p.UserID).
			SetCreatedAt(p.CreatedAt).
			OnConflictColumns(chatmember.FieldID, chatmember.FieldUserID).
			DoNothing().
			Exec(ctx); err != nil {
			return err
		}
		if err := tx.ChatPreference.Create().
			SetID(p.ChatID).
			SetUserID(p.UserID).
			OnConflictColumns(chatpreference.FieldID, chatpreference.FieldUserID).
			DoNothing().
			Exec(ctx); err != nil {
			return err
		}
		create := tx.RefreshToken.Create().
			SetID(p.RefreshTokenID).
			SetUserID(p.UserID).
			SetTokenHash(p.TokenHash).
			SetExpiresAt(p.ExpiresAt).
			SetCreatedAt(p.CreatedAt)
		if p.IPAddress != "" {
			create.SetIPAddress(p.IPAddress)
		}
		_, err := create.Save(ctx)
		return err
	})
}

// CreateAdminUser creates an admin user for an existing or new family.
func (s *Store) CreateAdminUser(ctx context.Context, p SetupParams) (*ent.User, error) {
	var createdUser *ent.User
	err := s.WithTx(ctx, func(tx *ent.Tx) error {
		family, err := tx.Family.Query().First(ctx)
		if err != nil || family == nil {
			familyID := p.FamilyID
			if familyID == "" {
				familyID = p.UserID
			}
			familyName := p.FamilyName
			if familyName == "" {
				familyName = "Stovo Server"
			}
			family, err = tx.Family.Create().
				SetID(familyID).
				SetName(familyName).
				SetCreatedAt(p.CreatedAt).
				SetUpdatedAt(p.CreatedAt).
				Save(ctx)
			if err != nil {
				return err
			}
		}

		u, err := tx.User.Create().
			SetID(p.UserID).
			SetFamilyID(family.ID).
			SetUsername(p.Username).
			SetPasswordHash(p.PasswordHash).
			SetDisplayName(p.DisplayName).
			SetRole(p.Role).
			SetIsActive(1).
			SetCreatedAt(p.CreatedAt).
			Save(ctx)
		if err != nil {
			return err
		}
		createdUser = u

		c, err := tx.Chat.Query().Where(chat.FamilyIDEQ(family.ID)).First(ctx)
		if err != nil || c == nil {
			c, err = tx.Chat.Create().
				SetID(p.ChatID).
				SetFamilyID(family.ID).
				SetType("family").
				SetTitle("General Family Chat").
				SetCreatedBy(p.UserID).
				SetMediaVisibility("family").
				SetEncryptionProtocol("end_to_end").
				SetCreatedAt(p.CreatedAt).
				SetUpdatedAt(p.CreatedAt).
				Save(ctx)
		}
		if err == nil && c != nil {
			_ = tx.ChatMember.Create().
				SetID(c.ID).
				SetUserID(p.UserID).
				SetCreatedAt(p.CreatedAt).
				OnConflictColumns(chatmember.FieldID, chatmember.FieldUserID).
				DoNothing().
				Exec(ctx)
			_ = tx.ChatPreference.Create().
				SetID(c.ID).
				SetUserID(p.UserID).
				OnConflictColumns(chatpreference.FieldID, chatpreference.FieldUserID).
				DoNothing().
				Exec(ctx)
		}

		create := tx.RefreshToken.Create().
			SetID(p.RefreshTokenID).
			SetUserID(p.UserID).
			SetTokenHash(p.TokenHash).
			SetExpiresAt(p.ExpiresAt).
			SetCreatedAt(p.CreatedAt)
		if p.IPAddress != "" {
			create.SetIPAddress(p.IPAddress)
		}
		_, err = create.Save(ctx)
		return err
	})
	return createdUser, err
}

// UserByID loads a user by primary key.
func (s *Store) UserByID(ctx context.Context, userID string) (*ent.User, error) {
	return s.Client.User.Get(ctx, userID)
}

// UserByUsernameFold loads a user with case-insensitive username match (lower(username) = lower(?)).
func (s *Store) UserByUsernameFold(ctx context.Context, username string) (*ent.User, error) {
	return s.Client.User.Query().
		Where(user.UsernameEqualFold(username)).
		First(ctx)
}

// CreateRefreshTokenParams holds refresh token insert fields.
type CreateRefreshTokenParams struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt string
	CreatedAt string
	IPAddress string
}

// CreateRefreshToken inserts a refresh token row.
func (s *Store) CreateRefreshToken(ctx context.Context, tx *ent.Tx, p CreateRefreshTokenParams) error {
	create := s.client(tx).RefreshToken.Create().
		SetID(p.ID).
		SetUserID(p.UserID).
		SetTokenHash(p.TokenHash).
		SetExpiresAt(p.ExpiresAt).
		SetCreatedAt(p.CreatedAt)
	if p.IPAddress != "" {
		create.SetIPAddress(p.IPAddress)
	}
	_, err := create.Save(ctx)
	return err
}

// RefreshTokenByHash loads a refresh token by its hash.
func (s *Store) RefreshTokenByHash(ctx context.Context, tokenHash string) (*ent.RefreshToken, error) {
	return s.Client.RefreshToken.Query().
		Where(refreshtoken.TokenHashEQ(tokenHash)).
		Only(ctx)
}

// RotateRefreshTokenParams holds inputs for rotating a refresh token.
type RotateRefreshTokenParams struct {
	OldTokenHash string
	NewID        string
	UserID       string
	NewTokenHash string
	NewExpiresAt string
	CreatedAt    string
	IPAddress    string
	RevokedAt    string
}

// RotateRefreshToken revokes the old token and inserts the new one atomically.
func (s *Store) RotateRefreshToken(ctx context.Context, p RotateRefreshTokenParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if _, err := tx.RefreshToken.Update().
			Where(refreshtoken.TokenHashEQ(p.OldTokenHash)).
			SetRevokedAt(p.RevokedAt).
			Save(ctx); err != nil {
			return err
		}
		return s.CreateRefreshToken(ctx, tx, CreateRefreshTokenParams{
			ID:        p.NewID,
			UserID:    p.UserID,
			TokenHash: p.NewTokenHash,
			ExpiresAt: p.NewExpiresAt,
			CreatedAt: p.CreatedAt,
			IPAddress: p.IPAddress,
		})
	})
}

// RevokeRefreshTokenByHash sets revoked_at = COALESCE(revoked_at, ?) for the given hash.
func (s *Store) RevokeRefreshTokenByHash(ctx context.Context, tokenHash, revokedAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		_, err := tx.RefreshToken.Update().
			Where(
				refreshtoken.TokenHashEQ(tokenHash),
				refreshtoken.RevokedAtIsNil(),
			).
			SetRevokedAt(revokedAt).
			Save(ctx)
		return err
	})
}

// RevokeUserSessions sets revoked_at = COALESCE(revoked_at, ?) for all tokens of a user.
func (s *Store) RevokeUserSessions(ctx context.Context, tx *ent.Tx, userID, revokedAt string) error {
	_, err := s.client(tx).RefreshToken.Update().
		Where(
			refreshtoken.UserIDEQ(userID),
			refreshtoken.RevokedAtIsNil(),
		).
		SetRevokedAt(revokedAt).
		Save(ctx)
	return err
}

// UpdateUserPasswordAndRevokeOtherSessions changes a user's password and invalidates every
// refresh session other than the supplied current session in one transaction.
func (s *Store) UpdateUserPasswordAndRevokeOtherSessions(ctx context.Context, userID, passwordHash, currentTokenHash, revokedAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if _, err := tx.User.UpdateOneID(userID).SetPasswordHash(passwordHash).Save(ctx); err != nil {
			return err
		}
		_, err := tx.RefreshToken.Update().
			Where(
				refreshtoken.UserIDEQ(userID),
				refreshtoken.TokenHashNEQ(currentTokenHash),
				refreshtoken.RevokedAtIsNil(),
			).
			SetRevokedAt(revokedAt).
			Save(ctx)
		return err
	})
}

// UpdateUserProfileParams holds optional profile/privacy updates.
type UpdateUserProfileParams struct {
	DisplayName         *string
	PublicKey           *string
	ProfilePhotoFileID  *string
	ClearProfilePhoto   bool
	ProfileVisibility   *string
	LastSeenVisibility  *string
	ReadReceiptsEnabled *bool
	Email               *string
	Bio                 *string
	Timezone            *string
}

// UpdateUserProfile applies partial updates to a user inside a transaction.
func (s *Store) UpdateUserProfile(ctx context.Context, userID string, p UpdateUserProfileParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		upd := tx.User.UpdateOneID(userID)
		if p.DisplayName != nil {
			upd.SetDisplayName(*p.DisplayName)
		}
		if p.PublicKey != nil {
			upd.SetPublicKey(*p.PublicKey)
		}
		if p.ClearProfilePhoto {
			upd.ClearProfilePhotoFileID()
		} else if p.ProfilePhotoFileID != nil {
			upd.SetProfilePhotoFileID(*p.ProfilePhotoFileID)
		}
		if p.ProfileVisibility != nil {
			upd.SetProfileVisibility(*p.ProfileVisibility)
		}
		if p.LastSeenVisibility != nil {
			upd.SetLastSeenVisibility(*p.LastSeenVisibility)
		}
		if p.ReadReceiptsEnabled != nil {
			upd.SetReadReceiptsEnabled(*p.ReadReceiptsEnabled)
		}
		if p.Email != nil {
			if *p.Email == "" {
				upd.ClearEmail()
			} else {
				upd.SetEmail(*p.Email)
			}
		}
		if p.Bio != nil {
			if *p.Bio == "" {
				upd.ClearBio()
			} else {
				upd.SetBio(*p.Bio)
			}
		}
		if p.Timezone != nil {
			if *p.Timezone == "" {
				upd.ClearTimezone()
			} else {
				upd.SetTimezone(*p.Timezone)
			}
		}
		_, err := upd.Save(ctx)
		return err
	})
}

// AudioCallSettings returns the raw audio_call_settings JSON for a user (may be nil).
func (s *Store) AudioCallSettings(ctx context.Context, userID string) (*string, error) {
	u, err := s.Client.User.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	return u.AudioCallSettings, nil
}

// SetAudioCallSettings persists audio_call_settings JSON for a user.
func (s *Store) SetAudioCallSettings(ctx context.Context, userID, settingsJSON string) error {
	_, err := s.Client.User.UpdateOneID(userID).
		SetAudioCallSettings(settingsJSON).
		Save(ctx)
	return err
}

// UpdateUserLastSeen records when the user's final active socket disconnected.
func (s *Store) UpdateUserLastSeen(ctx context.Context, userID, lastSeenAt string) error {
	_, err := s.Client.User.UpdateOneID(userID).SetLastSeenAt(lastSeenAt).Save(ctx)
	return err
}

// NtfyTopicToken returns the user's ntfy topic token (may be nil).
func (s *Store) NtfyTopicToken(ctx context.Context, userID string) (*string, error) {
	u, err := s.Client.User.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	return u.NtfyTopicToken, nil
}

// SetNtfyTopicToken persists the ntfy topic token for a user.
func (s *Store) SetNtfyTopicToken(ctx context.Context, userID, token string) error {
	_, err := s.Client.User.UpdateOneID(userID).
		SetNtfyTopicToken(token).
		Save(ctx)
	return err
}
