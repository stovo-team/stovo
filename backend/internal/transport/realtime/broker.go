package realtime

import (
	"encoding/json"
	"strings"

	"stovo-messenger/backend/internal/ports"
)

// MessageBrokerDependencies are the outer-adapter capabilities needed to
// translate a broker event into the established Socket.IO notifications. The
// transport owns event decoding and payload construction; membership, session
// presence and actual socket delivery remain injected capabilities.
type MessageBrokerDependencies struct {
	Members func(chatID string) ([]string, error)
	Online  func(userID string) bool
	Emit    EmitToUser
	Seen    func(eventID string) bool
}

// NewMessageBrokerHandler returns the transport-side broker consumer for the
// stable message.created event. It intentionally works with JSON payloads so
// no app-private presenter model leaks into runtime or broker code.
func NewMessageBrokerHandler(deps MessageBrokerDependencies) func(ports.Event) error {
	return func(event ports.Event) error {
		eventType := strings.TrimSpace(stringValue(event["type"]))
		switch eventType {
		case "message.created":
			eventID := strings.TrimSpace(stringValue(event["event_id"]))
			if eventID == "" {
				eventID = "message:" + strings.TrimSpace(stringValue(event["message_id"]))
			}
			if deps.Seen != nil && deps.Seen(eventID) {
				return nil
			}
			payload, ok := event["payload"]
			if !ok {
				return nil
			}
			raw, err := json.Marshal(payload)
			if err != nil {
				return err
			}
			var message struct {
				ID       string `json:"id"`
				ChatID   string `json:"chatId"`
				SenderID string `json:"senderId"`
			}
			if err := json.Unmarshal(raw, &message); err != nil {
				return err
			}
			if strings.TrimSpace(message.ChatID) == "" || strings.TrimSpace(message.ID) == "" || deps.Members == nil || deps.Emit == nil {
				return nil
			}
			members, err := deps.Members(message.ChatID)
			if err != nil {
				// Membership lookup was historically best-effort for broker fanout.
				return nil
			}
			EmitToUsers(deps.Emit, members, "message:new", payload)
			online := make([]string, 0, len(members))
			for _, memberID := range members {
				if memberID != message.SenderID && deps.Online != nil && deps.Online(memberID) {
					online = append(online, memberID)
				}
			}
			if len(online) > 0 {
				EmitToUsers(deps.Emit, members, "message:delivered", MessageDeliveredPayload(message.ChatID, message.ID, online))
			}
			return nil

		case "typing.update":
			eventID := strings.TrimSpace(stringValue(event["event_id"]))
			if deps.Seen != nil && eventID != "" && deps.Seen(eventID) {
				return nil
			}
			chatID := strings.TrimSpace(stringValue(event["chat_id"]))
			senderID := strings.TrimSpace(stringValue(event["sender_id"]))
			payload, ok := event["payload"]
			if !ok || chatID == "" || deps.Members == nil || deps.Emit == nil {
				return nil
			}
			members, err := deps.Members(chatID)
			if err != nil {
				return nil
			}
			recipients := make([]string, 0, len(members))
			for _, memberID := range members {
				if memberID != senderID {
					recipients = append(recipients, memberID)
				}
			}
			if len(recipients) > 0 {
				EmitToUsers(deps.Emit, recipients, "typing:update", payload)
			}
			return nil

		case "message.read":
			eventID := strings.TrimSpace(stringValue(event["event_id"]))
			if deps.Seen != nil && eventID != "" && deps.Seen(eventID) {
				return nil
			}
			chatID := strings.TrimSpace(stringValue(event["chat_id"]))
			payload, ok := event["payload"]
			if !ok || chatID == "" || deps.Members == nil || deps.Emit == nil {
				return nil
			}
			members, err := deps.Members(chatID)
			if err != nil {
				return nil
			}
			EmitToUsers(deps.Emit, members, "message:read", payload)
			return nil

		case "message.updated":
			eventID := strings.TrimSpace(stringValue(event["event_id"]))
			if deps.Seen != nil && eventID != "" && deps.Seen(eventID) {
				return nil
			}
			chatID := strings.TrimSpace(stringValue(event["chat_id"]))
			payload, ok := event["payload"]
			if !ok || chatID == "" || deps.Members == nil || deps.Emit == nil {
				return nil
			}
			members, err := deps.Members(chatID)
			if err != nil {
				return nil
			}
			EmitToUsers(deps.Emit, members, "message:updated", payload)
			return nil

		case "message.deleted":
			eventID := strings.TrimSpace(stringValue(event["event_id"]))
			if deps.Seen != nil && eventID != "" && deps.Seen(eventID) {
				return nil
			}
			chatID := strings.TrimSpace(stringValue(event["chat_id"]))
			payload, ok := event["payload"]
			if !ok || chatID == "" || deps.Members == nil || deps.Emit == nil {
				return nil
			}
			members, err := deps.Members(chatID)
			if err != nil {
				return nil
			}
			EmitToUsers(deps.Emit, members, "message:deleted", payload)
			return nil

		case "call.user":
			eventID := strings.TrimSpace(stringValue(event["event_id"]))
			if deps.Seen != nil && eventID != "" && deps.Seen(eventID) {
				return nil
			}
			targetUserID := strings.TrimSpace(stringValue(event["user_id"]))
			eventName := strings.TrimSpace(stringValue(event["event_name"]))
			payload, ok := event["payload"]
			if !ok || targetUserID == "" || eventName == "" || deps.Emit == nil {
				return nil
			}
			_ = deps.Emit(targetUserID, eventName, payload)
			return nil

		default:
			return nil
		}
	}
}

func stringValue(value any) string {
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return typed
}
