// Package presenter contains HTTP-only response DTOs. Keeping these types at
// the transport edge prevents JSON field names and optional presentation data
// from leaking into feature services.
package presenter

import (
	"encoding/json"
	"net/http"
	"time"
)

// Member is the stable JSON representation of a chat participant.
// ProfilePhoto deliberately remains presentation data: its concrete shape is
// supplied by the files presenter while JSON serialization stays unchanged.
type Member struct {
	ID                 string     `json:"id"`
	DisplayName        string     `json:"displayName"`
	Username           string     `json:"username"`
	Role               string     `json:"role"`
	PublicKey          *string    `json:"publicKey"`
	ProfilePhoto       any        `json:"profilePhoto"`
	IsOnline           bool       `json:"isOnline"`
	LastSeenAt         *time.Time `json:"lastSeenAt"`
	LastSeenVisibility string     `json:"lastSeenVisibility"`
}

// Chat is the stable REST representation used by GET /api/chats and
// GET /api/chats/{chatId}. It contains no feature or persistence types.
type Chat struct {
	ID                              string         `json:"id"`
	FamilyID                        string         `json:"familyId"`
	Type                            string         `json:"type"`
	Title                           *string        `json:"title"`
	Description                     *string        `json:"description"`
	CreatedBy                       *string        `json:"createdBy"`
	MediaVisibility                 string         `json:"mediaVisibility"`
	CommentsEnabled                 bool           `json:"commentsEnabled"`
	EncryptionProtocol              string         `json:"encryptionProtocol"`
	MediaVisibilityPendingApproval  bool           `json:"mediaVisibilityPendingApproval"`
	MediaVisibilityApprovalCount    int            `json:"mediaVisibilityApprovalCount"`
	MediaVisibilityApprovalRequired int            `json:"mediaVisibilityApprovalRequired"`
	MyMediaVisibilityApproval       bool           `json:"myMediaVisibilityApproval"`
	ChatPhoto                       any            `json:"chatPhoto"`
	CreatedAt                       time.Time      `json:"createdAt"`
	UpdatedAt                       time.Time      `json:"updatedAt"`
	Members                         []Member       `json:"members"`
	UnreadCount                     int            `json:"unreadCount"`
	LastMessageID                   *string        `json:"lastMessageId"`
	LastMessageSenderID             *string        `json:"lastMessageSenderId"`
	LastMessageSenderDisplayName    *string        `json:"lastMessageSenderDisplayName"`
	LastMessageContent              *string        `json:"lastMessageContent"`
	LastMessageType                 *string        `json:"lastMessageType"`
	LastMessageCreatedAt            *time.Time     `json:"lastMessageCreatedAt"`
	IsMuted                         bool           `json:"isMuted"`
	IsPinned                        bool           `json:"isPinned"`
	IsFavorite                      bool           `json:"isFavorite"`
	Wallpaper                       any            `json:"wallpaper"`
	PinPermission                   string         `json:"pinPermission"`
	MessageDelaySeconds             int            `json:"messageDelaySeconds"`
	ActiveCall                      map[string]any `json:"activeCall,omitempty"`
}

// WriteChat preserves the existing JSON response semantics for chat reads.
func WriteChat(w http.ResponseWriter, status int, chat Chat) {
	writeJSON(w, status, chat)
}

// WriteChats preserves the existing JSON response semantics for chat lists.
func WriteChats(w http.ResponseWriter, status int, chats []Chat) {
	writeJSON(w, status, chats)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
