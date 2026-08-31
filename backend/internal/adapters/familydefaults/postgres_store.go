// Package familydefaults provides the Postgres implementation of the family
// defaults port consumed by the family feature.
package familydefaults

import (
	"context"
	"database/sql"

	featurefamily "stovo-messenger/backend/internal/features/family"
)

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

func (s *PostgresStore) MemberDefaults(ctx context.Context, familyID string) (featurefamily.MemberDefaults, error) {
	var defaults featurefamily.MemberDefaults
	err := s.db.QueryRowContext(ctx, `
		SELECT default_profile_visibility, default_last_seen_visibility,
		       default_read_receipts_enabled, default_notification_settings
		FROM families WHERE id = $1`, familyID).Scan(
		&defaults.ProfileVisibility, &defaults.LastSeenVisibility,
		&defaults.ReadReceiptsEnabled, &defaults.NotificationSettings)
	if err != nil {
		return featurefamily.MemberDefaults{
			ProfileVisibility:    "everyone",
			LastSeenVisibility:   "everyone",
			ReadReceiptsEnabled:  true,
			NotificationSettings: `{"messageNotifications":true,"messagePreview":true,"messageSound":true,"callNotifications":true,"ringtoneEnabled":true,"quietHoursEnabled":false,"quietHoursStart":"22:00","quietHoursEnd":"07:00"}`,
		}, nil
	}
	return defaults, nil
}

func (s *PostgresStore) SaveMemberDefaults(ctx context.Context, familyID string, defaults featurefamily.MemberDefaults) error {
	_, _ = s.db.ExecContext(ctx, `
		UPDATE families
		SET default_profile_visibility = $1, default_last_seen_visibility = $2,
		    default_read_receipts_enabled = $3, default_notification_settings = $4,
		    updated_at = now()
		WHERE id = $5`, defaults.ProfileVisibility, defaults.LastSeenVisibility,
		defaults.ReadReceiptsEnabled, defaults.NotificationSettings, familyID)
	return nil
}
