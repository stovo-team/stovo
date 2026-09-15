// Package chatsettings provides persistence adapters for chat feature settings.
package chatsettings

import (
	"context"

	"stovo-messenger/backend/internal/features/chats"
	"stovo-messenger/backend/internal/repository"
)

// DelayStore maps the legacy Ent-backed store to the chat feature's neutral
// settings port. Ent models do not cross this boundary.
type DelayStore struct {
	store *repository.Store
}

func NewDelayStore(store *repository.Store) *DelayStore {
	return &DelayStore{store: store}
}

func (s *DelayStore) UpdateMessageDelay(ctx context.Context, chatID string, seconds int, updatedAt string) (chats.MessageDelay, error) {
	updated, err := s.store.UpdateChatMessageDelay(ctx, chatID, seconds, updatedAt)
	if err != nil {
		return chats.MessageDelay{}, err
	}
	return chats.MessageDelay{Seconds: updated.MessageDelaySeconds, UpdatedAt: updated.UpdatedAt}, nil
}

func (s *DelayStore) UpdateCommentsEnabled(ctx context.Context, chatID string, enabled bool, updatedAt string) error {
	return s.store.UpdateChatCommentsEnabled(ctx, chatID, enabled, updatedAt)
}

func (s *DelayStore) UpdatePinPermission(ctx context.Context, chatID, permission, updatedAt string) error {
	return s.store.UpdateChatPinPermission(ctx, chatID, permission, updatedAt)
}

func (s *DelayStore) UpdateMediaVisibility(ctx context.Context, chatID, visibility, updatedAt string) error {
	return s.store.SetChatMediaVisibility(ctx, chatID, visibility, updatedAt)
}

func (s *DelayStore) ApproveDirectMediaVisibility(ctx context.Context, chatID, userID, createdAt, updatedAt string) error {
	return s.store.ApproveDirectMediaVisibility(ctx, chatID, userID, createdAt, updatedAt)
}

func (s *DelayStore) UpdateTitle(ctx context.Context, chatID, title, updatedAt string) error {
	return s.store.UpdateChatTitle(ctx, chatID, title, updatedAt)
}

func (s *DelayStore) UpdateDescription(ctx context.Context, chatID string, description *string, updatedAt string) error {
	return s.store.UpdateChatDescription(ctx, chatID, description, updatedAt)
}

func (s *DelayStore) UpdatePhoto(ctx context.Context, chatID string, photoFileID *string, updatedAt string) error {
	return s.store.UpdateChatPhoto(ctx, chatID, photoFileID, updatedAt)
}

func (s *DelayStore) UpdatePreferences(ctx context.Context, preferences chats.Preferences) error {
	return s.store.UpdateChatPreferences(ctx, repository.UpdateChatPreferencesParams{
		ChatID:               preferences.ChatID,
		UserID:               preferences.UserID,
		IsMuted:              preferences.IsMuted,
		MutedUntil:           preferences.MutedUntil,
		ClearMutedUntil:      preferences.ClearMutedUntil,
		QuietHoursEnabled:    preferences.QuietHoursEnabled,
		QuietHoursStart:      preferences.QuietHoursStart,
		QuietHoursEnd:        preferences.QuietHoursEnd,
		NotificationMode:     preferences.NotificationMode,
		NotifySenderIDs:      preferences.NotifySenderIDs,
		AlwaysNotifyMentions: preferences.AlwaysNotifyMentions,
		IsPinned:             preferences.IsPinned,
		IsFavorite:           preferences.IsFavorite,
		WallpaperFileID:      preferences.WallpaperFileID,
		ClearWallpaper:       preferences.ClearWallpaper,
	})
}
