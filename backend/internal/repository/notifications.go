package repository

import (
	"context"

	"stovo-messenger/backend/ent/chatmember"
	"stovo-messenger/backend/ent/chatpreference"
	"stovo-messenger/backend/internal/ports"
)

// ListChatMemberUserIDs returns user_id values for a chat.
func (s *Store) ListChatMemberUserIDs(ctx context.Context, chatID string) ([]string, error) {
	members, err := s.Client.ChatMember.Query().
		Where(chatmember.IDEQ(chatID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	return ids, nil
}

// GetChatNotificationPreferences returns notification evaluation preferences for the specified chat members.
func (s *Store) GetChatNotificationPreferences(ctx context.Context, chatID string, userIDs []string) (map[string]ports.ChatNotificationPreference, error) {
	result := make(map[string]ports.ChatNotificationPreference, len(userIDs))
	if len(userIDs) == 0 {
		return result, nil
	}

	prefs, err := s.Client.ChatPreference.Query().
		Where(
			chatpreference.IDEQ(chatID),
			chatpreference.UserIDIn(userIDs...),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	for _, p := range prefs {
		qStart := "22:00"
		if p.QuietHoursStart != nil && *p.QuietHoursStart != "" {
			qStart = *p.QuietHoursStart
		}
		qEnd := "07:00"
		if p.QuietHoursEnd != nil && *p.QuietHoursEnd != "" {
			qEnd = *p.QuietHoursEnd
		}
		mode := "all"
		if p.NotificationMode != "" {
			mode = p.NotificationMode
		}

		result[p.UserID] = ports.ChatNotificationPreference{
			IsMuted:              p.IsMuted,
			MutedUntil:           p.MutedUntil,
			QuietHoursEnabled:    p.QuietHoursEnabled,
			QuietHoursStart:      qStart,
			QuietHoursEnd:        qEnd,
			NotificationMode:     mode,
			NotifySenderIDs:      p.NotifySenderIds,
			AlwaysNotifyMentions: p.AlwaysNotifyMentions,
		}
	}

	// For any member without a preference row, use sensible defaults
	for _, uid := range userIDs {
		if _, ok := result[uid]; !ok {
			result[uid] = ports.ChatNotificationPreference{
				IsMuted:              false,
				QuietHoursEnabled:    false,
				QuietHoursStart:      "22:00",
				QuietHoursEnd:        "07:00",
				NotificationMode:     "all",
				AlwaysNotifyMentions: true,
			}
		}
	}

	return result, nil
}
