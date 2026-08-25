// Package domain contains business concepts without transport or storage concerns.
package domain

import "strings"

type CallType string

const (
	CallTypeAudio CallType = "audio"
	CallTypeVideo CallType = "video"
)

func NormalizeCallType(value string) CallType {
	if CallType(value) == CallTypeVideo {
		return CallTypeVideo
	}
	return CallTypeAudio
}

type ChatType string

const (
	ChatTypeDirect  ChatType = "direct"
	ChatTypeGroup   ChatType = "group"
	ChatTypeFamily  ChatType = "family"
	ChatTypeVoice   ChatType = "voice"
	ChatTypeChannel ChatType = "channel"
)

func (t ChatType) SupportsCalls() bool {
	return t == ChatTypeDirect || t == ChatTypeGroup || t == ChatTypeFamily || t == ChatTypeVoice
}

func (t ChatType) StartsConnected() bool {
	return t == ChatTypeGroup || t == ChatTypeFamily || t == ChatTypeVoice
}

type CallChat struct {
	ID      string
	Type    ChatType
	Members []string
}

func (c CallChat) HasMember(userID string) bool {
	for _, memberID := range c.Members {
		if memberID == userID {
			return true
		}
	}
	return false
}

type ParticipantRole string

const (
	ParticipantHost   ParticipantRole = "host"
	ParticipantMember ParticipantRole = "member"
)

type CallParticipant struct {
	UserID string
	Role   ParticipantRole
}

type CallInitiation struct {
	ChatID       string
	CallerUserID string
	CallType     CallType
	Participants []CallParticipant
	StartsActive bool
}

func (c CallInitiation) InviteeIDs() []string {
	capacity := len(c.Participants)
	if capacity > 0 {
		capacity--
	}
	ids := make([]string, 0, capacity)
	for _, participant := range c.Participants {
		if participant.Role == ParticipantMember {
			ids = append(ids, participant.UserID)
		}
	}
	return ids
}

func CleanUserIDs(ids []string, except string) []string {
	seen := map[string]bool{except: true}
	cleaned := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		cleaned = append(cleaned, id)
	}
	return cleaned
}
