package app

import (
	"context"
	"errors"
	"net/http"

	featurechats "stovo-messenger/backend/internal/features/chats"
)

func (s *Server) pinMessage(ctx context.Context, chatID, messageID string, user userPublic) (any, int, error) {
	fetchedChatID, err := s.pins.MessageChatID(ctx, messageID)
	if err != nil {
		if errors.Is(err, featurechats.ErrNotFound) {
			return nil, 0, newStatusError(http.StatusNotFound, "Message not found")
		}
		return nil, 0, newStatusError(http.StatusInternalServerError, "Failed to verify message")
	}
	if fetchedChatID != chatID {
		return nil, 0, newStatusError(http.StatusNotFound, "Message not found")
	}

	chat, err := s.buildChatPublic(chatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusForbidden, "Chat not found or access denied")
	}

	if chat.PinPermission == "admins_only" && !hasPermission(user, permissionManageMessages) {
		return nil, 0, newStatusError(http.StatusForbidden, "Only admins can pin messages in this chat")
	}

	pin, created, err := s.pins.Pin(ctx, chatID, messageID, user.ID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Failed to pin message")
	}

	if !created {
		message, err := s.buildMessage(messageID, user.ID)
		if err != nil {
			return nil, 0, newStatusError(http.StatusInternalServerError, "Failed to load pinned message")
		}
		existingPin := pinnedMessagePublic{
			ChatID:    chatID,
			MessageID: messageID,
			PinnedBy:  pin.PinnedBy,
			PinnedAt:  pin.PinnedAt,
			Message:   message,
		}
		return existingPin, http.StatusOK, nil
	}

	message, err := s.buildMessage(messageID, user.ID)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Failed to load pinned message")
	}

	pinnedMsg := pinnedMessagePublic{
		ChatID:    chatID,
		MessageID: messageID,
		PinnedBy:  pin.PinnedBy,
		PinnedAt:  pin.PinnedAt,
		Message:   message,
	}

	s.emitMessagePinned(chatID, pinnedMsg)
	return pinnedMsg, http.StatusCreated, nil
}

func (s *Server) unpinMessage(ctx context.Context, chatID, messageID string, user userPublic) (any, error) {
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		return nil, newStatusError(http.StatusForbidden, "Chat not found or access denied")
	}

	pin, err := s.pins.Get(ctx, chatID, messageID)
	if err != nil {
		if errors.Is(err, featurechats.ErrNotFound) {
			return nil, newStatusError(http.StatusNotFound, "Pin not found")
		}
		return nil, newStatusError(http.StatusInternalServerError, "Failed to load pin")
	}

	if user.ID != pin.PinnedBy && !hasPermission(user, permissionManageMessages) {
		return nil, newStatusError(http.StatusForbidden, "Cannot unpin this message")
	}

	if err := s.pins.Delete(ctx, chatID, messageID); err != nil {
		return nil, newStatusError(http.StatusInternalServerError, "Failed to unpin message")
	}

	s.emitMessageUnpinned(chatID, messageID)
	return map[string]string{"chatId": chatID, "messageId": messageID}, nil
}

func (s *Server) listPins(ctx context.Context, chatID string, user userPublic) (any, error) {
	if _, err := s.buildChatPublic(chatID, user); err != nil {
		return nil, newStatusError(http.StatusForbidden, "Chat not found or access denied")
	}

	pinsRows, err := s.pins.List(ctx, chatID)
	if err != nil {
		return nil, newStatusError(http.StatusInternalServerError, "Failed to load pins")
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
			PinnedAt:  row.PinnedAt,
			Message:   message,
		})
	}

	return pins, nil
}
