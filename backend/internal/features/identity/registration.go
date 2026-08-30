// Package identity contains account and registration business rules.
package identity

import (
	"context"
	"errors"
	"strings"
	"time"
)

var (
	ErrPasswordTooShort        = errors.New("new password must be at least 8 characters")
	ErrPasswordUnchanged       = errors.New("new password must differ from the current password")
	ErrInvalidVisibility       = errors.New("visibility must be family or nobody")
	ErrInvalidFamilyVisibility = errors.New("family default visibility must be everyone or nobody")
	ErrInvalidSession          = errors.New("refresh session is invalid")
)

// Registration holds the user-controlled names accepted during setup and
// family-invite registration. It intentionally contains no transport DTOs.
type Registration struct {
	FamilyName  string
	Nickname    string
	Username    string
	DisplayName string
}

// NormalizeRegistration applies the legacy nickname defaults and whitespace
// policy consistently to both setup and invite acceptance.
func NormalizeRegistration(input Registration, includeFamilyName bool) Registration {
	input.FamilyName = strings.TrimSpace(input.FamilyName)
	input.Nickname = strings.TrimSpace(input.Nickname)
	input.Username = strings.TrimSpace(input.Username)
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	if input.Username == "" {
		if input.Nickname != "" {
			input.Username = input.Nickname
		} else {
			input.Username = input.DisplayName
		}
	}
	if input.DisplayName == "" {
		if input.Nickname != "" {
			input.DisplayName = input.Nickname
		} else {
			input.DisplayName = input.Username
		}
	}
	if includeFamilyName && input.FamilyName == "" {
		input.FamilyName = "Family"
		if input.DisplayName != "" {
			input.FamilyName = input.DisplayName + "'s Family"
		}
	}
	return input
}

func ValidatePasswordChange(current, next string) error {
	if len(next) < 8 {
		return ErrPasswordTooShort
	}
	if next == current {
		return ErrPasswordUnchanged
	}
	return nil
}

func ValidateProfileVisibility(values ...*string) error {
	for _, value := range values {
		if value != nil && *value != "family" && *value != "nobody" {
			return ErrInvalidVisibility
		}
	}
	return nil
}

func ValidateFamilyDefaultVisibility(values ...*string) error {
	for _, value := range values {
		if value != nil && *value != "everyone" && *value != "nobody" {
			return ErrInvalidFamilyVisibility
		}
	}
	return nil
}

// SessionToken is the persistence-neutral result of issuing a refresh session.
// The raw token is returned only to the transport; adapters persist its hash.
type SessionToken struct {
	Raw       string
	Hash      string
	ExpiresAt string
}

type TokenGenerator func() (string, error)
type TokenHasher func(string) string

type RefreshSessionWriter interface {
	SessionByHash(context.Context, string) (RefreshSession, error)
	CreateSession(context.Context, PersistedSession) error
	RotateSession(context.Context, RotatedSession) error
	RevokeSession(context.Context, string, string) error
	ChangePassword(context.Context, PasswordChange) error
}

type PersistedSession struct{ ID, UserID, TokenHash, ExpiresAt, CreatedAt, IPAddress string }
type RotatedSession struct {
	OldTokenHash string
	New          PersistedSession
	RevokedAt    string
}
type PasswordChange struct{ UserID, PasswordHash, CurrentTokenHash, RevokedAt string }

// ProfilePatch is the identity-owned representation of a partial profile
// update. It avoids exposing Ent or repository parameters to transports.
type ProfilePatch struct {
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

type ProfileStore interface {
	UpdateProfile(context.Context, string, ProfilePatch) error
	UpdateLastSeen(context.Context, string, string) error
}

type ProfileService struct{ store ProfileStore }

func NewProfileService(store ProfileStore) *ProfileService { return &ProfileService{store: store} }

func (s *ProfileService) Update(ctx context.Context, userID string, patch ProfilePatch) error {
	if err := ValidateProfileVisibility(patch.ProfileVisibility, patch.LastSeenVisibility); err != nil {
		return err
	}
	return s.store.UpdateProfile(ctx, userID, patch)
}

func (s *ProfileService) RecordLastSeen(ctx context.Context, userID string, at time.Time) error {
	return s.store.UpdateLastSeen(ctx, userID, at.UTC().Format(time.RFC3339Nano))
}

func IssueSessionToken(generate TokenGenerator, hash TokenHasher, now time.Time, ttl time.Duration) (SessionToken, error) {
	raw, err := generate()
	if err != nil {
		return SessionToken{}, err
	}
	return SessionToken{Raw: raw, Hash: hash(raw), ExpiresAt: now.Add(ttl).UTC().Format(time.RFC3339Nano)}, nil
}

// DeviceLoginCodeMatches compares the stored and submitted code digests
// without exposing either representation to transport-specific policy.
func DeviceLoginCodeMatches(storedHash, submitted string, hash TokenHasher) bool {
	if storedHash == "" || hash == nil {
		return false
	}
	actual, expected := []byte(storedHash), []byte(hash(strings.TrimSpace(submitted)))
	if len(actual) != len(expected) {
		return false
	}
	var different byte
	for i := range actual {
		different |= actual[i] ^ expected[i]
	}
	return different == 0
}

type RefreshSession struct {
	UserID    string
	ExpiresAt string
	Revoked   bool
}

func ValidateRefreshSession(session RefreshSession, now time.Time) error {
	if session.UserID == "" || session.Revoked {
		return ErrInvalidSession
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, session.ExpiresAt)
	if err != nil {
		expiresAt, err = time.Parse(time.RFC3339, session.ExpiresAt)
	}
	if err != nil || expiresAt.Before(now) {
		return ErrInvalidSession
	}
	return nil
}
