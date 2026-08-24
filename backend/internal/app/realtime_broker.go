package app

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"family-messenger/backend/internal/broker"
)

const brokerChannelMessages = "events:messages"

func (s *Server) startBrokerConsumers() {
	s.realtimeCtx, s.realtimeCancel = context.WithCancel(context.Background())
	s.realtimeWG.Add(1)
	go func() {
		defer s.realtimeWG.Done()
		for {
			if s.realtimeCtx.Err() != nil {
				return
			}
			err := s.broker.Subscribe(s.realtimeCtx, brokerChannelMessages, s.handleBrokerMessageEvent)
			if s.realtimeCtx.Err() != nil {
				return
			}
			if err != nil {
				s.logger.Warnf("realtime", "broker subscribe failed channel=%s error=%v", brokerChannelMessages, err)
				time.Sleep(800 * time.Millisecond)
			}
		}
	}()
}

func (s *Server) handleBrokerMessageEvent(event broker.BrokerEvent) error {
	eventType := strings.TrimSpace(stringValue(event["type"]))
	if eventType != "message.created" {
		return nil
	}
	eventID := strings.TrimSpace(stringValue(event["event_id"]))
	if eventID == "" {
		eventID = "message:" + strings.TrimSpace(stringValue(event["message_id"]))
	}
	if s.eventDeduplicator().Seen(eventID) {
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
	var message messagePublic
	if err := json.Unmarshal(raw, &message); err != nil {
		return err
	}
	if strings.TrimSpace(message.ChatID) == "" || strings.TrimSpace(message.ID) == "" {
		return nil
	}
	members, err := s.chatMembers(message.ChatID)
	if err != nil {
		return nil
	}
	for _, member := range members {
		_ = s.sockets.To("user:"+member.ID).Emit("message:new", message)
	}
	onlineRecipients := make([]string, 0)
	for _, member := range members {
		if member.ID == message.SenderID {
			continue
		}
		if s.sessions.IsOnline(member.ID) {
			onlineRecipients = append(onlineRecipients, member.ID)
		}
	}
	if len(onlineRecipients) > 0 {
		deliveredPayload := map[string]any{
			"messageId": message.ID,
			"chatId":    message.ChatID,
			"userIds":   onlineRecipients,
		}
		for _, member := range members {
			_ = s.sockets.To("user:"+member.ID).Emit("message:delivered", deliveredPayload)
		}
	}
	return nil
}

func stringValue(value any) string {
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return typed
}
