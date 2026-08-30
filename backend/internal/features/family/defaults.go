// Package family contains use cases that belong to a family rather than an
// HTTP handler or a persistence model.
package family

import "context"

const defaultNotificationSettingsJSON = `{"messageNotifications":true,"messagePreview":true,"messageSound":true,"callNotifications":true,"ringtoneEnabled":true,"quietHoursEnabled":false,"quietHoursStart":"22:00","quietHoursEnd":"07:00"}`

// MemberDefaults are applied when a person accepts an invite to a family.
// They remain persistence-neutral so consumers do not need Ent models.
type MemberDefaults struct {
	ProfileVisibility    string
	LastSeenVisibility   string
	ReadReceiptsEnabled  bool
	NotificationSettings string
}

type MemberDefaultsPatch struct {
	ProfileVisibility    *string
	LastSeenVisibility   *string
	ReadReceiptsEnabled  *bool
	NotificationSettings *string
}

type MemberDefaultsStore interface {
	MemberDefaults(context.Context, string) (MemberDefaults, error)
	SaveMemberDefaults(context.Context, string, MemberDefaults) error
}

type DefaultsService struct {
	store MemberDefaultsStore
}

// MembershipStore owns atomic membership lifecycle changes. The feature asks
// for one operation, leaving Ent transaction types outside its boundary.
type MembershipStore interface {
	RemoveMember(context.Context, string, string) error
}

type MembershipService struct{ store MembershipStore }

func NewMembershipService(store MembershipStore) *MembershipService {
	return &MembershipService{store: store}
}

func (s *MembershipService) Remove(ctx context.Context, userID, revokedAt string) error {
	return s.store.RemoveMember(ctx, userID, revokedAt)
}

func NewDefaultsService(store MemberDefaultsStore) *DefaultsService {
	return &DefaultsService{store: store}
}

func (s *DefaultsService) Get(ctx context.Context, familyID string) (MemberDefaults, error) {
	defaults, err := s.store.MemberDefaults(ctx, familyID)
	if err != nil {
		return MemberDefaults{}, err
	}
	return normalizeMemberDefaults(defaults), nil
}

func (s *DefaultsService) Update(ctx context.Context, familyID string, patch MemberDefaultsPatch) (MemberDefaults, error) {
	defaults, err := s.Get(ctx, familyID)
	if err != nil {
		return MemberDefaults{}, err
	}
	if patch.ProfileVisibility != nil {
		defaults.ProfileVisibility = *patch.ProfileVisibility
	}
	if patch.LastSeenVisibility != nil {
		defaults.LastSeenVisibility = *patch.LastSeenVisibility
	}
	if patch.ReadReceiptsEnabled != nil {
		defaults.ReadReceiptsEnabled = *patch.ReadReceiptsEnabled
	}
	if patch.NotificationSettings != nil {
		defaults.NotificationSettings = *patch.NotificationSettings
	}
	if err := s.store.SaveMemberDefaults(ctx, familyID, defaults); err != nil {
		return MemberDefaults{}, err
	}
	return defaults, nil
}

func normalizeMemberDefaults(defaults MemberDefaults) MemberDefaults {
	if defaults.ProfileVisibility == "" || defaults.ProfileVisibility == "family" {
		defaults.ProfileVisibility = "everyone"
	}
	if defaults.LastSeenVisibility == "" || defaults.LastSeenVisibility == "family" {
		defaults.LastSeenVisibility = "everyone"
	}
	if defaults.NotificationSettings == "" {
		defaults.NotificationSettings = defaultNotificationSettingsJSON
	}
	return defaults
}
