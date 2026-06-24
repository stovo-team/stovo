package app

import (
	"net/http"
	"time"
)

func (s *Server) handlePinMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	messageID := messageIDFromURL(r)

	// Verify the message exists and is not soft-deleted, and belongs to chatID.
	var fetchedChatID string
	row := s.queryRow(`SELECT chat_id FROM messages WHERE id = ? AND deleted_at IS NULL`, messageID)
	if err := row.Scan(&fetchedChatID); err != nil {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}
	if fetchedChatID != chatID {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}

	// Verify calling user is a chat member and retrieve chat (including PinPermission).
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.detail(w, http.StatusForbidden, "Chat not found or access denied")
		return
	}

	// Check pin permission using the value already loaded by buildChatPublic.
	if chat.PinPermission == "admins_only" && !isAdmin(user.Role) {
		s.detail(w, http.StatusForbidden, "Only admins can pin messages in this chat")
		return
	}

	// Capture timestamp once so the INSERT and response struct are in perfect agreement.
	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339Nano)

	// Insert pin record (idempotent via ON CONFLICT DO NOTHING).
	result, err := s.exec(`
		INSERT INTO pinned_messages (chat_id, message_id, pinned_by, pinned_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (chat_id, message_id) DO NOTHING
	`, chatID, messageID, user.ID, nowStr)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to pin message")
		return
	}

	// If the pin already existed (ON CONFLICT DO NOTHING was a no-op), return 200 with the
	// stored pin data so the client is not misled into thinking a new resource was created.
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		var existingPinnedBy, existingPinnedAtStr string
		existingRow := s.queryRow(`SELECT pinned_by, pinned_at FROM pinned_messages WHERE chat_id = ? AND message_id = ?`, chatID, messageID)
		if err := existingRow.Scan(&existingPinnedBy, &existingPinnedAtStr); err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to load existing pin")
			return
		}
		message, err := s.buildMessage(messageID, user.ID)
		if err != nil {
			s.detail(w, http.StatusInternalServerError, "Failed to load pinned message")
			return
		}
		existingPin := pinnedMessagePublic{
			ChatID:    chatID,
			MessageID: messageID,
			PinnedBy:  existingPinnedBy,
			PinnedAt:  parseTime(existingPinnedAtStr),
			Message:   message,
		}
		s.json(w, http.StatusOK, existingPin)
		return
	}

	// Build full message payload for response and broadcast.
	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to load pinned message")
		return
	}

	pinnedMsg := pinnedMessagePublic{
		ChatID:    chatID,
		MessageID: messageID,
		PinnedBy:  user.ID,
		PinnedAt:  now, // same instant as the INSERT
		Message:   message,
	}

	s.emitMessagePinned(chatID, pinnedMsg)
	s.json(w, http.StatusCreated, pinnedMsg)
}

func (s *Server) handleUnpinMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	messageID := messageIDFromURL(r)

	// Verify calling user is a chat member — same guard used in handlePinMessage.
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		s.detail(w, http.StatusForbidden, "Chat not found or access denied")
		return
	}

	// Verify pin exists and fetch the pinner.
	var pinnedBy string
	row := s.queryRow(`SELECT pinned_by FROM pinned_messages WHERE chat_id = ? AND message_id = ?`, chatID, messageID)
	if err := row.Scan(&pinnedBy); err != nil {
		s.detail(w, http.StatusNotFound, "Pin not found")
		return
	}

	// Authorization: only the pinner or a family admin/owner may unpin.
	if user.ID != pinnedBy && !isAdmin(user.Role) {
		s.detail(w, http.StatusForbidden, "Cannot unpin this message")
		return
	}

	if _, err := s.exec(`DELETE FROM pinned_messages WHERE chat_id = ? AND message_id = ?`, chatID, messageID); err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to unpin message")
		return
	}

	s.emitMessageUnpinned(chatID, messageID)
	s.json(w, http.StatusOK, map[string]string{"chatId": chatID, "messageId": messageID})
}

func (s *Server) handleGetPins(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)

	// Verify membership.
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		s.detail(w, http.StatusForbidden, "Chat not found or access denied")
		return
	}

	rows, err := s.query(`
		SELECT pm.message_id, pm.pinned_by, pm.pinned_at
		FROM pinned_messages pm
		JOIN messages m ON m.id = pm.message_id
		WHERE pm.chat_id = ? AND m.deleted_at IS NULL
		ORDER BY pm.pinned_at DESC
	`, chatID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to load pins")
		return
	}
	defer rows.Close()

	pins := []pinnedMessagePublic{}
	for rows.Next() {
		var msgID, pinnedBy, pinnedAtStr string
		if err := rows.Scan(&msgID, &pinnedBy, &pinnedAtStr); err != nil {
			// Scan errors on valid DB rows are unexpected; treat as fatal to avoid
			// returning a corrupt or truncated list with no indication of failure.
			s.detail(w, http.StatusInternalServerError, "Failed to read pins")
			return
		}
		message, err := s.buildMessage(msgID, user.ID)
		if err != nil {
			// Message may be deleted or unavailable; log and skip rather than failing
			// the whole response.
			s.logger.Warnf("pins", "skipping pin for deleted/missing message=%s err=%v", msgID, err)
			continue
		}
		pinnedAt := parseTime(pinnedAtStr)
		pins = append(pins, pinnedMessagePublic{
			ChatID:    chatID,
			MessageID: msgID,
			PinnedBy:  pinnedBy,
			PinnedAt:  pinnedAt,
			Message:   message,
		})
	}

	s.json(w, http.StatusOK, pins)
}
