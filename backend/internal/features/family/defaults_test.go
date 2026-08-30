package family

import (
	"context"
	"testing"
)

type defaultsStoreFake struct {
	defaults MemberDefaults
	saved    MemberDefaults
}

type membershipStoreFake struct{ userID, revokedAt string }

func (s *membershipStoreFake) RemoveMember(_ context.Context, userID, revokedAt string) error {
	s.userID, s.revokedAt = userID, revokedAt
	return nil
}

func TestMembershipServiceDelegatesAtomicRemoval(t *testing.T) {
	store := &membershipStoreFake{}
	service := NewMembershipService(store)
	if err := service.Remove(context.Background(), "member", "2026-08-30T00:00:00Z"); err != nil {
		t.Fatal(err)
	}
	if store.userID != "member" || store.revokedAt == "" {
		t.Fatalf("store=%+v", store)
	}
}

func (s *defaultsStoreFake) MemberDefaults(context.Context, string) (MemberDefaults, error) {
	return s.defaults, nil
}
func (s *defaultsStoreFake) SaveMemberDefaults(_ context.Context, _ string, defaults MemberDefaults) error {
	s.saved = defaults
	return nil
}

func TestDefaultsServiceNormalizesLegacyValuesAndAppliesPatch(t *testing.T) {
	store := &defaultsStoreFake{defaults: MemberDefaults{ProfileVisibility: "family", LastSeenVisibility: "", ReadReceiptsEnabled: true}}
	service := NewDefaultsService(store)
	profile := "nobody"
	receipts := false
	updated, err := service.Update(context.Background(), "family-1", MemberDefaultsPatch{ProfileVisibility: &profile, ReadReceiptsEnabled: &receipts})
	if err != nil {
		t.Fatalf("update defaults: %v", err)
	}
	if updated.ProfileVisibility != "nobody" || updated.LastSeenVisibility != "everyone" || updated.ReadReceiptsEnabled || updated.NotificationSettings != defaultNotificationSettingsJSON {
		t.Fatalf("updated=%+v", updated)
	}
	if store.saved != updated {
		t.Fatalf("saved=%+v updated=%+v", store.saved, updated)
	}
}
