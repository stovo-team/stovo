package app

import (
	"bytes"
	"context"
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
	token, err := s.store.NtfyTopicToken(ctx, userID)
	if err != nil {
		return "", err
	}
	if token == nil || *token == "" {
		return "", nil
	}
	return *token, nil
}

func (s *Server) publishToNtfy(ctx context.Context, payload ntfyPayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("ntfy marshal: %w", err)
	}
	// ntfy JSON publishing API: POST to base URL with topic in the JSON body.
	// Posting to /{topic} treats the entire body as plain text — the JSON fields
	// (title, tags, click, etc.) are ignored and the raw JSON becomes the message.
	url := s.cfg.NtfyBaseURL
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

func (s *Server) publishToNtfyWithRetry(ctx context.Context, userID string, payload ntfyPayload) {
	if err := s.publishToNtfy(ctx, payload); err != nil {
		s.logger.Warnf("ntfy", "publish failed, queuing retry user_id=%s: %v", userID, err)
		select {
		case s.ntfyRetryCh <- ntfyRetryItem{UserID: userID, Payload: payload, Attempt: 0}:
		default:
			s.logger.Warnf("ntfy", "retry channel full, dropping user_id=%s", userID)
		}
	}
}

func formatMessageNotification(chatType string, chatTitle *string, senderName string, messagePreview string) (title string, message string, tags []string) {
	tags = []string{"speech_balloon"}
	if chatType == "direct" {
		tags = append(tags, "direct")
		return senderName, messagePreview, tags
	}
	title = "Chat"
	if chatTitle != nil {
		if trimmed := strings.TrimSpace(*chatTitle); trimmed != "" {
			title = trimmed
		}
	}
	return title, senderName + ": " + messagePreview, tags
}

func (s *Server) notifyMessageRecipients(chatID string, chatType string, chatTitle *string, senderID string, senderName string, messagePreview string) {
	title, message, tags := formatMessageNotification(chatType, chatTitle, senderName, messagePreview)
	memberIDs, err := s.store.ListChatMemberUserIDs(context.Background(), chatID)
	if err != nil {
		s.logger.Warnf("ntfy", "failed to query chat members for chat_id=%s: %v", chatID, err)
		return
	}
	for _, recipientID := range memberIDs {
		if recipientID == senderID {
			continue
		}
		if s.userViewingChatInForeground(recipientID, chatID) {
			continue
		}
		topic, err := s.getUserNtfyTopic(context.Background(), recipientID)
		if err != nil || topic == "" {
			s.logger.Warnf("ntfy", "no topic for user_id=%s: %v", recipientID, err)
			continue
		}
		go func(recipientID, topic string) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			p := ntfyPayload{
				Topic:    topic,
				Title:    title,
				Message:  message,
				Priority: 3,
				Tags:     tags,
				Click:    "stovo://chat/" + chatID,
			}
			s.publishToNtfyWithRetry(ctx, recipientID, p)
		}(recipientID, topic)
	}
}

func (s *Server) notifyCallRinging(calleeUserID string, callerName string, chatID string) {
	if s.userViewingChatInForeground(calleeUserID, chatID) {
		return
	}
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
			Click:    "stovo://call/" + chatID,
		}
		s.publishToNtfyWithRetry(ctx, calleeUserID, p)
	}(topic)
}

func (s *Server) notifyCallMissed(calleeUserID string, callerName string, chatID string) {
	if s.userViewingChatInForeground(calleeUserID, chatID) {
		return
	}
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
			Click:    "stovo://call/missed/" + chatID,
		}
		s.publishToNtfyWithRetry(ctx, calleeUserID, p)
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
