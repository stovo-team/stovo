package app

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"

	featurechattransfer "stovo-messenger/backend/internal/features/chattransfer"
)

func (s *Server) loadMessageImportAttribution(ctx context.Context, messageID string) (*messageImportAttributionPublic, error) {
	if s.sqlDB == nil {
		return nil, nil
	}
	var attribution messageImportAttributionPublic
	err := s.sqlDB.QueryRowContext(ctx, `SELECT b.source_provider,a.source_message_id,a.source_author_id,a.source_author_name,a.source_reactions,a.source_metadata,a.source_attachments,a.source_deleted_at FROM message_import_attributions a JOIN chat_import_batches b ON b.id=a.import_batch_id WHERE a.message_id=$1`, messageID).Scan(&attribution.SourceProvider, &attribution.SourceMessageID, &attribution.SourceAuthorID, &attribution.SourceAuthorName, &attribution.Reactions, &attribution.Metadata, &attribution.SourceAttachments, &attribution.SourceDeletedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &attribution, nil
}

type chatTransferExportSource struct {
	Chat     chatPublic      `json:"chat"`
	ChatID   string          `json:"chatId"`
	Messages []messagePublic `json:"messages"`
}

func (s *Server) chatTransferSource(ctx context.Context, user userPublic, chatID string) (any, error) {
	if s.sqlDB == nil {
		return nil, errNotFound
	}
	chat, err := s.buildChatPublic(chatID, user)
	if err != nil || chat.FamilyID != user.FamilyID {
		return nil, errNotFound
	}
	rows, err := s.sqlDB.QueryContext(ctx, `SELECT id FROM messages WHERE chat_id=$1 AND deleted_at IS NULL ORDER BY created_at ASC,id ASC`, chatID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) > featurechattransfer.MaxMessages {
		return nil, newStatusError(http.StatusRequestEntityTooLarge, "Chat is too large to export in one V1 archive")
	}
	messages := make([]messagePublic, 0, len(ids))
	for _, id := range ids {
		message, err := s.buildMessage(id, user.ID)
		if err != nil {
			return nil, err
		}
		if chat.EncryptionProtocol == encryptionProtocolEndToEnd {
			message.Content = nil
		}
		messages = append(messages, message)
	}
	return chatTransferExportSource{Chat: chat, ChatID: chatID, Messages: messages}, nil
}

func (s *Server) commitChatImport(ctx context.Context, user userPublic, idempotencyKey string, archive featurechattransfer.Archive, prepared map[string]featurechattransfer.StoredMessageContent) (any, int, error) {
	if !user.IsActive || s.chatImport == nil || s.sqlDB == nil {
		return nil, 0, newStatusError(http.StatusServiceUnavailable, "Chat import is unavailable")
	}
	if _, err := s.getFamily(user.FamilyID); err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not load family encryption settings")
	}
	protocol := s.defaultMessageEncryptionProtocol(user.FamilyID)
	if protocol == encryptionProtocolEndToEnd {
		for _, message := range archive.Messages {
			content, ok := prepared[message.SourceID]
			if !ok || message.Text != nil || content.Content != nil || content.Ciphertext == nil || content.Nonce == nil || content.EncryptionMetadata == nil || strings.TrimSpace(*content.Ciphertext) == "" || strings.TrimSpace(*content.Nonce) == "" || strings.TrimSpace(*content.EncryptionMetadata) == "" {
				return nil, 0, newStatusError(http.StatusUnprocessableEntity, "End-to-end encrypted imports must be encrypted in the browser before upload")
			}
		}
	}
	if protocol != encryptionProtocolEndToEnd {
		for _, message := range archive.Messages {
			if message.Text == nil {
				return nil, 0, newStatusError(http.StatusUnprocessableEntity, "Non-end-to-end imports must include message text for destination encryption")
			}
		}
	}
	if protocol == encryptionProtocolServerAtRest {
		prepared = make(map[string]featurechattransfer.StoredMessageContent, len(archive.Messages))
		for _, message := range archive.Messages {
			plaintext := ""
			if message.Text != nil {
				plaintext = *message.Text
			}
			plaintext = strings.ReplaceAll(strings.ToValidUTF8(plaintext, "�"), "\x00", "�")
			ciphertext, nonce, err := s.encryptServerAtRest(user.FamilyID, plaintext)
			if err != nil {
				return nil, 0, newStatusError(http.StatusInternalServerError, "Could not encrypt imported messages")
			}
			metadata := messageEncryptionMetadataServer
			prepared[message.SourceID] = featurechattransfer.StoredMessageContent{Ciphertext: &ciphertext, Nonce: &nonce, EncryptionMetadata: &metadata}
		}
	}
	result, err := s.chatImport.Commit(ctx, featurechattransfer.ImportRequest{
		FamilyID: user.FamilyID, ImportingUserID: user.ID, IdempotencyKey: idempotencyKey,
		Archive: archive, Encryption: protocol, PreparedContent: prepared,
	})
	if errors.Is(err, featurechattransfer.ErrIdempotencyConflict) {
		return nil, 0, newStatusError(http.StatusConflict, err.Error())
	}
	if err != nil {
		var validation *featurechattransfer.ValidationError
		if errors.As(err, &validation) || errors.Is(err, featurechattransfer.ErrImportRequestInvalid) {
			return nil, 0, newStatusError(http.StatusUnprocessableEntity, err.Error())
		}
		if errors.Is(err, featurechattransfer.ErrAttachmentStorage) {
			return nil, 0, newStatusError(http.StatusServiceUnavailable, err.Error())
		}
		return nil, 0, newStatusError(http.StatusInternalServerError, "Could not import chat")
	}
	chat, err := s.buildChatPublic(result.ChatID, user)
	if err != nil {
		return nil, 0, newStatusError(http.StatusInternalServerError, "Chat was imported but could not be loaded")
	}
	status := http.StatusCreated
	if result.Replayed {
		status = http.StatusOK
	}
	return chat, status, nil
}
