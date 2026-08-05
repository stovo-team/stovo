package app

import (
	"net/http"
	"time"

	"family-messenger/backend/ent"
)

func (s *Server) handlePinMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	messageID := messageIDFromURL(r)

	fetchedChatID, err := s.store.MessageChatIDIfActive(r.Context(), messageID)
	if err != nil {
		if ent.IsNotFound(err) {
			s.detail(w, http.StatusNotFound, "Message not found")
			return
		}
		s.detail(w, http.StatusInternalServerError, "Failed to verify message")
		return
	}
	if fetchedChatID != chatID {
		s.detail(w, http.StatusNotFound, "Message not found")
		return
	}

	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		s.detail(w, http.StatusForbidden, "Chat not found or access denied")
		return
	}

	if chat.PinPermission == "admins_only" && !isAdmin(user.Role) {
		s.detail(w, http.StatusForbidden, "Only admins can pin messages in this chat")
		return
	}

	now := time.Now().UTC()

	created, err := s.store.TryPinMessage(r.Context(), chatID, messageID, user.ID, now)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to pin message")
		return
	}

	if !created {
		existing, err := s.store.GetPin(r.Context(), chatID, messageID)
		if err != nil {
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
			PinnedBy:  existing.PinnedBy,
			PinnedAt:  existing.PinnedAt.UTC(),
			Message:   message,
		}
		s.json(w, http.StatusOK, existingPin)
		return
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to load pinned message")
		return
	}

	pinnedMsg := pinnedMessagePublic{
		ChatID:    chatID,
		MessageID: messageID,
		PinnedBy:  user.ID,
		PinnedAt:  now,
		Message:   message,
	}

	s.emitMessagePinned(chatID, pinnedMsg)
	s.json(w, http.StatusCreated, pinnedMsg)
}

func (s *Server) handleUnpinMessage(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)
	messageID := messageIDFromURL(r)

	if _, err := s.buildChatPublic(chatID, user); err != nil {
		s.detail(w, http.StatusForbidden, "Chat not found or access denied")
		return
	}

	pin, err := s.store.GetPin(r.Context(), chatID, messageID)
	if err != nil {
		if ent.IsNotFound(err) {
			s.detail(w, http.StatusNotFound, "Pin not found")
			return
		}
		s.detail(w, http.StatusInternalServerError, "Failed to load pin")
		return
	}

	if user.ID != pin.PinnedBy && !isAdmin(user.Role) {
		s.detail(w, http.StatusForbidden, "Cannot unpin this message")
		return
	}

	if err := s.store.DeletePin(r.Context(), chatID, messageID); err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to unpin message")
		return
	}

	s.emitMessageUnpinned(chatID, messageID)
	s.json(w, http.StatusOK, map[string]string{"chatId": chatID, "messageId": messageID})
}

func (s *Server) handleGetPins(w http.ResponseWriter, r *http.Request, user userPublic) {
	chatID := chatIDFromURL(r)

	if _, err := s.buildChatPublic(chatID, user); err != nil {
		s.detail(w, http.StatusForbidden, "Chat not found or access denied")
		return
	}

	pinsRows, err := s.store.ListActivePins(r.Context(), chatID)
	if err != nil {
		s.detail(w, http.StatusInternalServerError, "Failed to load pins")
		return
	}

	pins := []pinnedMessagePublic{}
	for _, row := range pinsRows {
		message, err := s.buildMessage(row.MessageID, user.ID)
		if err != nil {
			s.logger.Warnf("pins", "skipping pin for deleted/missing message=%s err=%v", row.MessageID, err)
			continue
		}
		pins = append(pins, pinnedMessagePublic{
			ChatID:    chatID,
			MessageID: row.MessageID,
			PinnedBy:  row.PinnedBy,
			PinnedAt:  row.PinnedAt.UTC(),
			Message:   message,
		})
	}

	s.json(w, http.StatusOK, pins)
}
