// Package realtime contains Socket.IO transport concerns shared by inbound
// handlers. It intentionally contains no application policy or feature logic.
package realtime

import (
	"encoding/json"
	"net/url"
	"strings"

	socketio "github.com/doquangtan/socketio/v4"
)

// CallStartRequest, CallActionRequest, CallInviteRequest and
// CallSignalRequest are the stable inbound Socket.IO wire DTOs. They belong to
// the realtime transport rather than the call coordinator.
type CallStartRequest struct {
	ChatID        string   `json:"chatId"`
	CallType      string   `json:"callType"`
	InviteUserIDs []string `json:"inviteUserIds"`
}

type CallActionRequest struct {
	ChatID string `json:"chatId"`
	RoomID string `json:"roomId"`
}

type CallInviteRequest struct {
	ChatID        string   `json:"chatId"`
	RoomID        string   `json:"roomId"`
	InviteUserIDs []string `json:"inviteUserIds"`
}

type CallSignalRequest struct {
	ChatID       string         `json:"chatId"`
	RoomID       string         `json:"roomId"`
	TargetUserID *string        `json:"targetUserId"`
	Data         map[string]any `json:"data"`
}

type MessageSendRequest struct {
	ChatID              string   `json:"chatId"`
	Content             *string  `json:"content"`
	ReplyToMessageID    *string  `json:"replyToMessageId"`
	ThreadRootMessageID *string  `json:"threadRootMessageId"`
	FileIDs             []string `json:"fileIds"`
	ClientMessageID     *string  `json:"clientMessageId"`
	EncryptionProtocol  *string  `json:"encryptionProtocol"`
	Ciphertext          *string  `json:"ciphertext"`
	Nonce               *string  `json:"nonce"`
	KeyVersion          *int     `json:"keyVersion"`
	EncryptionMetadata  *string  `json:"encryptionMetadata"`
	MentionedUserIDs    []string `json:"mentionedUserIds"`
}

type MessageReadRequest struct {
	MessageID string  `json:"messageId"`
	ChatID    *string `json:"chatId"`
}

type TypingRequest struct {
	ChatID string `json:"chatId"`
}

type AppStateRequest struct {
	Foreground   bool   `json:"foreground"`
	ActiveChatID string `json:"activeChatId"`
}


// DecodePayload converts Socket.IO's dynamically typed event data into the
// transport DTO supplied by the caller.
func DecodePayload(value any, target any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

// MapPayload preserves the historical health-ping echo representation.
func MapPayload(value any) map[string]any {
	result := make(map[string]any)
	data, err := json.Marshal(value)
	if err != nil {
		return result
	}
	_ = json.Unmarshal(data, &result)
	return result
}

// ErrorPayload serializes the established Socket.IO error event payload.
func ErrorPayload(clientMessageID *string, message string) map[string]any {
	payload := map[string]any{"message": message}
	if clientMessageID != nil && *clientMessageID != "" {
		payload["clientMessageId"] = *clientMessageID
	}
	return payload
}

// ErrorAck serializes the established negative acknowledgement payload.
func ErrorAck(clientMessageID *string, message string) map[string]any {
	return map[string]any{"ok": false, "message": message, "clientMessageId": clientMessageID}
}

// AccessToken reads the authentication token using the existing precedence:
// Socket.IO auth first, then the token query parameter.
func AccessToken(socket *socketio.Socket) string {
	token := strings.TrimSpace(socket.Handshake.Auth.Token)
	if token != "" {
		return token
	}
	return QueryValue(socket, "token")
}

// QueryValue reads and trims a Socket.IO handshake query value.
func QueryValue(socket *socketio.Socket, key string) string {
	parsed, err := url.Parse(socket.Handshake.URL)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(parsed.Query().Get(key))
}
