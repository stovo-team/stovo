package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	workruntime "stovo-messenger/backend/internal/runtime"
)

func (s *Server) getUserNtfyTopic(ctx context.Context, userID string) (string, error) {
	token, err := s.notificationRecipients.NtfyTopicToken(ctx, userID)
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
	return workruntime.FormatMessageNotification(chatType, chatTitle, senderName, messagePreview)
}

func (s *Server) notifyMessageRecipients(chatID string, chatType string, chatTitle *string, senderID string, senderName string, messagePreview string, mentionedUserIDs []string) {
	title, message, tags := formatMessageNotification(chatType, chatTitle, senderName, messagePreview)
	mentioned := make(map[string]struct{}, len(mentionedUserIDs))
	for _, userID := range mentionedUserIDs {
		mentioned[userID] = struct{}{}
	}
	memberIDs, err := s.notificationRecipients.ListChatMemberUserIDs(context.Background(), chatID)
	if err != nil {
		s.logger.Warnf("ntfy", "failed to query chat members for chat_id=%s: %v", chatID, err)
		return
	}
	for _, recipientID := range memberIDs {
		if recipientID == senderID {
			continue
		}
		if s.sessions.IsViewingChatInForeground(recipientID, chatID) {
			continue
		}
		topic, err := s.getUserNtfyTopic(context.Background(), recipientID)
		if err != nil || topic == "" {
			s.logger.Warnf("ntfy", "no topic for user_id=%s: %v", recipientID, err)
			continue
		}
		_, isMentioned := mentioned[recipientID]
		go func(recipientID, topic string, isMentioned bool) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			priority := 3
			payloadTags := tags
			if isMentioned {
				priority = 5
				payloadTags = append(append([]string{}, tags...), "exclamation")
			}
			p := ntfyPayload{
				Topic:    topic,
				Title:    title,
				Message:  message,
				Priority: priority,
				Tags:     payloadTags,
				Click:    "stovo://chat/" + chatID,
			}
			s.publishToNtfyWithRetry(ctx, recipientID, p)
		}(recipientID, topic, isMentioned)
	}
}

func (s *Server) notifyCallRinging(calleeUserID string, callerName string, chatID string) {
	if s.sessions.IsViewingChatInForeground(calleeUserID, chatID) {
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
	if s.sessions.IsViewingChatInForeground(calleeUserID, chatID) {
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
	return workruntime.TruncateNotificationPreview(content)
}
