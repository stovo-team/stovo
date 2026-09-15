package ports

import (
	"context"
	"time"
)

// PrivacyBlocklist persists a member's direct-contact block list.
type PrivacyBlocklist interface {
	ListBlockedUserIDs(context.Context, string) ([]string, error)
	BlockUser(context.Context, string, string, string) error
	UnblockUser(context.Context, string, string) error
}

// DirectContactPolicy checks whether two members may contact one another.
type DirectContactPolicy interface {
	DirectContactBlocked(context.Context, string, string) (bool, error)
}

// AccountPreferences persists audio and notification settings for one member.
type AccountPreferences interface {
	AudioCallSettings(context.Context, string) (*string, error)
	SetAudioCallSettings(context.Context, string, string) error
	NtfyTopicToken(context.Context, string) (*string, error)
	SetNtfyTopicToken(context.Context, string, string) error
}

// ChatNotificationPreference holds the notification evaluation policy for a member in a chat.
type ChatNotificationPreference struct {
	IsMuted              bool
	MutedUntil           *time.Time
	QuietHoursEnabled    bool
	QuietHoursStart      string
	QuietHoursEnd        string
	NotificationMode     string
	NotifySenderIDs      []string
	AlwaysNotifyMentions bool
}

// NotificationRecipients supplies recipients and notification topics.
type NotificationRecipients interface {
	ListChatMemberUserIDs(context.Context, string) ([]string, error)
	NtfyTopicToken(context.Context, string) (*string, error)
	GetChatNotificationPreferences(context.Context, string, []string) (map[string]ChatNotificationPreference, error)
}
