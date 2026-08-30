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
		if strings.TrimSpace(stringValue(event["type"])) != "message.created" {
			return nil
		}
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
	}
}

func stringValue(value any) string {
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return typed
}
