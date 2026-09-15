package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"stovo-messenger/backend/internal/ports"
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

// isWithinQuietHours checks if now falls between start ("HH:MM") and end ("HH:MM").
// Handles intervals spanning midnight (e.g. 22:00 to 07:00).
func isWithinQuietHours(start, end string, now time.Time) bool {
	if len(start) != 5 || len(end) != 5 || start == end {
		return false
	}
	startParts := strings.Split(start, ":")
	endParts := strings.Split(end, ":")
	if len(startParts) != 2 || len(endParts) != 2 {
		return false
	}
	startH, err1 := strconv.Atoi(startParts[0])
	startM, err2 := strconv.Atoi(startParts[1])
	endH, err3 := strconv.Atoi(endParts[0])
	endM, err4 := strconv.Atoi(endParts[1])
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return false
	}
	from := startH*60 + startM
	to := endH*60 + endM
	current := now.Hour()*60 + now.Minute()

	if from < to {
		return current >= from && current < to
	}
	return current >= from || current < to
}

// NotificationDecision encapsulates the result of evaluating notification rules for a recipient.
type NotificationDecision struct {
	ShouldNotify bool
	Priority     int
	Reason       string
}

// ShouldNotifyRecipient determines whether a chat notification should be delivered to a recipient.
func ShouldNotifyRecipient(
	pref ports.ChatNotificationPreference,
	senderID string,
	isMentioned bool,
	isForeground bool,
	now time.Time,
) NotificationDecision {
	if isForeground {
		return NotificationDecision{ShouldNotify: false, Reason: "viewing_in_foreground"}
	}

	// 1. Evaluate active mute
	isMuted := pref.IsMuted
	if pref.MutedUntil != nil {
		if now.Before(*pref.MutedUntil) {
			isMuted = true
		} else {
			isMuted = false
		}
	}
	if isMuted {
		if isMentioned && pref.AlwaysNotifyMentions {
			return NotificationDecision{ShouldNotify: true, Priority: 5, Reason: "mention_breaks_mute"}
		}
		return NotificationDecision{ShouldNotify: false, Reason: "chat_muted"}
	}

	// 2. Evaluate quiet hours
	if pref.QuietHoursEnabled && isWithinQuietHours(pref.QuietHoursStart, pref.QuietHoursEnd, now) {
		if isMentioned && pref.AlwaysNotifyMentions {
			return NotificationDecision{ShouldNotify: true, Priority: 5, Reason: "mention_breaks_quiet_hours"}
		}
		return NotificationDecision{ShouldNotify: false, Reason: "quiet_hours"}
	}

	// 3. Evaluate notification mode
	switch pref.NotificationMode {
	case "mentions_only":
		if isMentioned {
			return NotificationDecision{ShouldNotify: true, Priority: 5, Reason: "mentioned"}
		}
		return NotificationDecision{ShouldNotify: false, Reason: "mentions_only_mode"}

	case "specific_senders":
		isAllowedSender := false
		for _, id := range pref.NotifySenderIDs {
			if id == senderID {
				isAllowedSender = true
				break
			}
		}
		if isAllowedSender {
			priority := 3
			if isMentioned {
				priority = 5
			}
			return NotificationDecision{ShouldNotify: true, Priority: priority, Reason: "allowed_sender"}
		}
		if isMentioned && pref.AlwaysNotifyMentions {
			return NotificationDecision{ShouldNotify: true, Priority: 5, Reason: "mention_breaks_sender_filter"}
		}
		return NotificationDecision{ShouldNotify: false, Reason: "sender_not_in_filter"}

	default: // "all"
		priority := 3
		if isMentioned {
			priority = 5
		}
		return NotificationDecision{ShouldNotify: true, Priority: priority, Reason: "all_messages"}
	}
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

	recipients := make([]string, 0, len(memberIDs))
	for _, id := range memberIDs {
		if id != senderID {
			recipients = append(recipients, id)
		}
	}
	if len(recipients) == 0 {
		return
	}

	prefsByUserID, err := s.notificationRecipients.GetChatNotificationPreferences(context.Background(), chatID, recipients)
	if err != nil {
		s.logger.Warnf("ntfy", "failed to query chat preferences for chat_id=%s: %v", chatID, err)
		prefsByUserID = make(map[string]ports.ChatNotificationPreference)
	}

	now := time.Now()
	for _, recipientID := range recipients {
		pref, hasPref := prefsByUserID[recipientID]
		if !hasPref {
			pref = ports.ChatNotificationPreference{
				IsMuted:              false,
				QuietHoursEnabled:    false,
				NotificationMode:     "all",
				AlwaysNotifyMentions: true,
			}
		}

		_, isMentioned := mentioned[recipientID]
		isForeground := s.sessions.IsViewingChatInForeground(recipientID, chatID)

		decision := ShouldNotifyRecipient(pref, senderID, isMentioned, isForeground, now)
		if !decision.ShouldNotify {
			continue
		}

		topic, err := s.getUserNtfyTopic(context.Background(), recipientID)
		if err != nil || topic == "" {
			s.logger.Warnf("ntfy", "no topic for user_id=%s: %v", recipientID, err)
			continue
		}

		go func(recipientID, topic string, priority int, isMentioned bool) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			payloadTags := tags
			if isMentioned {
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
		}(recipientID, topic, decision.Priority, isMentioned)
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
