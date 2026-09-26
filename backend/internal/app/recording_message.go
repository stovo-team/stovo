package app

import (
	"context"
	"database/sql"
	"strings"
)

func (s *Server) createRecordingChatMessage(ctx context.Context, user userPublic, chatID, fileID string, callHistoryMessageID sql.NullString) (messagePublic, error) {
	var replyTo *string
	if callHistoryMessageID.Valid && strings.TrimSpace(callHistoryMessageID.String) != "" {
		replyTo = &callHistoryMessageID.String
	}
	return s.createCallCompletionMessageWithPayloadContext(ctx, user, chatID, sendMessageRequest{
		Type: "video", FileIDs: []string{fileID}, ReplyToMessageID: replyTo,
	})
}
