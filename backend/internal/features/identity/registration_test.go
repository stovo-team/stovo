package identity

import (
	"context"
	"errors"
	"testing"
	"time"
)

type profileStoreFake struct {
	patch    ProfilePatch
	lastSeen string
}

func (s *profileStoreFake) UpdateProfile(_ context.Context, _ string, patch ProfilePatch) error {
	s.patch = patch
	return nil
}
func (s *profileStoreFake) UpdateLastSeen(_ context.Context, _ string, at string) error {
	s.lastSeen = at
	return nil
}

func TestProfileServiceValidatesVisibilityBeforePersistence(t *testing.T) {
	store := &profileStoreFake{}
	service := NewProfileService(store)
	invalid := "everyone"
	if err := service.Update(context.Background(), "user", ProfilePatch{ProfileVisibility: &invalid}); !errors.Is(err, ErrInvalidVisibility) {
		t.Fatalf("err=%v", err)
	}
	valid := "family"
	if err := service.Update(context.Background(), "user", ProfilePatch{ProfileVisibility: &valid}); err != nil {
		t.Fatal(err)
	}
	if store.patch.ProfileVisibility != &valid {
		t.Fatalf("patch=%+v", store.patch)
	}
}

func TestProfileServiceRecordsUTCLastSeen(t *testing.T) {
	store := &profileStoreFake{}
	service := NewProfileService(store)
	at := time.Date(2026, 8, 30, 14, 0, 0, 0, time.FixedZone("UTC+6", 6*60*60))
	if err := service.RecordLastSeen(context.Background(), "user", at); err != nil {
		t.Fatal(err)
	}
	if store.lastSeen != "2026-08-30T08:00:00Z" {
		t.Fatalf("lastSeen=%q", store.lastSeen)
	}
}

func TestNormalizeRegistrationUsesNicknameForMissingUserNames(t *testing.T) {
	got := NormalizeRegistration(Registration{Nickname: "  Nika  "}, true)
	if got.Username != "Nika" || got.DisplayName != "Nika" || got.FamilyName != "Nika's Family" {
		t.Fatalf("NormalizeRegistration() = %#v", got)
	}
}

func TestNormalizeRegistrationFallsBackToDisplayNameAndFamily(t *testing.T) {
	got := NormalizeRegistration(Registration{DisplayName: "  Alex  "}, true)
	if got.Username != "Alex" || got.DisplayName != "Alex" || got.FamilyName != "Alex's Family" {
		t.Fatalf("NormalizeRegistration() = %#v", got)
	}
}

func TestNormalizeRegistrationDoesNotCreateFamilyNameForInvite(t *testing.T) {
	got := NormalizeRegistration(Registration{Username: " user ", DisplayName: " "}, false)
	if got.Username != "user" || got.DisplayName != "user" || got.FamilyName != "" {
		t.Fatalf("NormalizeRegistration() = %#v", got)
	}
}

func TestValidatePasswordChange(t *testing.T) {
	if err := ValidatePasswordChange("current", "short"); !errors.Is(err, ErrPasswordTooShort) {
		t.Fatalf("short password error = %v", err)
	}
	if err := ValidatePasswordChange("same-password", "same-password"); !errors.Is(err, ErrPasswordUnchanged) {
		t.Fatalf("unchanged password error = %v", err)
	}
	if err := ValidatePasswordChange("current", "next-password"); err != nil {
		t.Fatalf("valid password error = %v", err)
	}
}

func TestValidateProfileVisibility(t *testing.T) {
	valid, invalid := "family", "everyone"
	if err := ValidateProfileVisibility(&valid, nil); err != nil {
		t.Fatalf("valid visibility: %v", err)
	}
	if err := ValidateProfileVisibility(&invalid); !errors.Is(err, ErrInvalidVisibility) {
		t.Fatalf("invalid visibility: %v", err)
	}
}

func TestValidateFamilyDefaultVisibility(t *testing.T) {
	valid, invalid := "everyone", "family"
	if err := ValidateFamilyDefaultVisibility(&valid, nil); err != nil {
		t.Fatalf("valid family default: %v", err)
	}
	if err := ValidateFamilyDefaultVisibility(&invalid); !errors.Is(err, ErrInvalidFamilyVisibility) {
		t.Fatalf("invalid family default: %v", err)
	}
}

func TestIssueSessionTokenUsesInjectedOuterCapabilities(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	token, err := IssueSessionToken(func() (string, error) { return "raw", nil }, func(value string) string { return "hash:" + value }, now, time.Hour)
	if err != nil || token.Raw != "raw" || token.Hash != "hash:raw" || token.ExpiresAt != now.Add(time.Hour).Format(time.RFC3339Nano) {
		t.Fatalf("token = %#v, err = %v", token, err)
	}
}

func TestDeviceLoginCodeMatches(t *testing.T) {
	hash := func(value string) string { return "hash:" + value }
	if !DeviceLoginCodeMatches("hash:123456", " 123456 ", hash) {
		t.Fatal("matching code rejected")
	}
	if DeviceLoginCodeMatches("hash:123456", "654321", hash) {
		t.Fatal("wrong code accepted")
	}
}

func TestValidateRefreshSession(t *testing.T) {
	now := time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC)
	valid := RefreshSession{UserID: "user", ExpiresAt: now.Add(time.Minute).Format(time.RFC3339Nano)}
	if err := ValidateRefreshSession(valid, now); err != nil {
		t.Fatalf("valid session: %v", err)
	}
	if err := ValidateRefreshSession(RefreshSession{UserID: "user", ExpiresAt: now.Format(time.RFC3339), Revoked: true}, now); !errors.Is(err, ErrInvalidSession) {
		t.Fatalf("revoked session: %v", err)
	}
}
