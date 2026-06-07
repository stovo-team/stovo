package app

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type ntfyPayload struct {
	Topic    string   `json:"topic"`
	Title    string   `json:"title"`
	Message  string   `json:"message"`
	Priority int      `json:"priority"`
	Tags     []string `json:"tags,omitempty"`
	Click    string   `json:"click,omitempty"`
}

func (s *Server) getUserNtfyTopic(ctx context.Context, userID string) (string, error) {
	var token sql.NullString
	row := s.queryRow(`SELECT ntfy_topic_token FROM users WHERE id = ?`, userID)
	if err := row.Scan(&token); err != nil {
		return "", err
	}
	if !token.Valid || token.String == "" {
		return "", nil
	}
	return token.String, nil
}

func (s *Server) publishToNtfy(ctx context.Context, payload ntfyPayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("ntfy marshal: %w", err)
	}
	url := s.cfg.NtfyBaseURL + "/" + payload.Topic
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("ntfy request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if s.cfg.NtfyPublishToken != "" {
		req.Header.Set("Authorization", "Bearer "+s.cfg.NtfyPublishToken)
	}
	resp, err := s.ntfyClient.Do(req)
	if err != nil {
		return fmt.Errorf("ntfy do: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("ntfy publish failed status=%d", resp.StatusCode)
	}
	return nil
}

func (s *Server) notifyMessageRecipients(chatID string, senderID string, senderName string, messagePreview string) {
	rows, err := s.query(`SELECT user_id FROM chat_members WHERE chat_id = ?`, chatID)
	if err != nil {
		s.logger.Warnf("ntfy", "failed to query chat members for chat_id=%s: %v", chatID, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var recipientID string
		if err := rows.Scan(&recipientID); err != nil {
			continue
		}
		if recipientID == senderID {
			continue
		}
		if s.userOnline(recipientID) {
			continue
		}
		topic, err := s.getUserNtfyTopic(context.Background(), recipientID)
		if err != nil || topic == "" {
			s.logger.Warnf("ntfy", "no topic for user_id=%s: %v", recipientID, err)
			continue
		}
		go func(topic string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			p := ntfyPayload{
				Topic:    topic,
				Title:    senderName,
				Message:  messagePreview,
				Priority: 3,
				Tags:     []string{"speech_balloon"},
				Click:    "stovo://chat/" + chatID,
			}
			if err := s.publishToNtfy(ctx, p); err != nil {
				s.logger.Warnf("ntfy", "publish failed user_topic=%s error=%v", topic, err)
			}
		}(topic)
	}
}

func (s *Server) notifyCallRinging(calleeUserID string, callerName string, chatID string) {
	topic, err := s.getUserNtfyTopic(context.Background(), calleeUserID)
	if err != nil || topic == "" {
		s.logger.Warnf("ntfy", "no topic for callee user_id=%s: %v", calleeUserID, err)
		return
	}
	go func(topic string) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		p := ntfyPayload{
			Topic:    topic,
			Title:    callerName,
			Message:  "Incoming call",
			Priority: 5,
			Tags:     []string{"phone"},
		}
		if err := s.publishToNtfy(ctx, p); err != nil {
			s.logger.Warnf("ntfy", "call ringing publish failed user_topic=%s error=%v", topic, err)
		}
	}(topic)
}

func (s *Server) notifyCallMissed(calleeUserID string, callerName string, chatID string) {
	topic, err := s.getUserNtfyTopic(context.Background(), calleeUserID)
	if err != nil || topic == "" {
		s.logger.Warnf("ntfy", "no topic for callee user_id=%s: %v", calleeUserID, err)
		return
	}
	go func(topic string) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		p := ntfyPayload{
			Topic:    topic,
			Title:    callerName,
			Message:  "Missed call",
			Priority: 3,
			Tags:     []string{"telephone_receiver"},
		}
		if err := s.publishToNtfy(ctx, p); err != nil {
			s.logger.Warnf("ntfy", "call missed publish failed user_topic=%s error=%v", topic, err)
		}
	}(topic)
}

func truncatePreview(content *string) string {
	if content == nil {
		return "New message"
	}
	s := strings.TrimSpace(*content)
	if len(s) > 100 {
		return s[:100] + "…"
	}
	if s == "" {
		return "New message"
	}
	return s
}
