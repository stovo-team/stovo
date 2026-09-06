package repository

import (
	"context"
	"strings"

	"entgo.io/ent/dialect/sql"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/chatpreference"
	"stovo-messenger/backend/ent/message"
	"stovo-messenger/backend/ent/messageattachment"
	"stovo-messenger/backend/ent/messagereaction"
	"stovo-messenger/backend/ent/messagestatus"
	"stovo-messenger/backend/ent/messageuserdeletion"
	"stovo-messenger/backend/ent/predicate"
)

// FindActiveForwardInChat returns a non-deleted message forwarded from sourceMessageID into chatID.
func (s *Store) FindActiveForwardInChat(ctx context.Context, chatID, sourceMessageID string) (string, error) {
	m, err := s.Client.Message.Query().
		Where(
			message.ChatIDEQ(chatID),
			message.ForwardedFromMessageIDEQ(sourceMessageID),
			message.DeletedAtIsNil(),
		).
		Only(ctx)
	if err != nil {
		return "", err
	}
	return m.ID, nil
}

// ListMessageIDsPageParams holds filters for paginated message id listing.
type ListMessageIDsPageParams struct {
	ChatID              string
	ViewerID            string
	BeforeCreatedAt     string // empty = no before filter
	ThreadRootMessageID string // empty = chat-kind only
	Limit               int
}

// ListMessageIDsPage returns message ids (newest first, length may be limit+1 for hasMore).
func (s *Store) ListMessageIDsPage(ctx context.Context, p ListMessageIDsPageParams) ([]string, error) {
	preds := []predicate.Message{
		message.ChatIDEQ(p.ChatID),
		message.DeletedAtIsNil(),
		predicate.Message(func(sel *sql.Selector) {
			mud := sql.Table(messageuserdeletion.Table)
			subq := sql.Select(mud.C(messageuserdeletion.FieldID)).
				From(mud).
				Where(sql.EQ(mud.C(messageuserdeletion.FieldUserID), p.ViewerID))
			sel.Where(sql.NotIn(sel.C(message.FieldID), subq))
		}),
	}
	if p.ThreadRootMessageID != "" {
		preds = append(preds, message.Or(
			message.IDEQ(p.ThreadRootMessageID),
			message.ThreadRootMessageIDEQ(p.ThreadRootMessageID),
		))
	} else {
		preds = append(preds, message.MessageKindEQ("chat"))
	}
	if p.BeforeCreatedAt != "" {
		preds = append(preds, message.CreatedAtLT(p.BeforeCreatedAt))
	}
	rows, err := s.Client.Message.Query().
		Where(preds...).
		Order(message.ByCreatedAt(sql.OrderDesc())).
		Limit(p.Limit).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, m := range rows {
		ids = append(ids, m.ID)
	}
	return ids, nil
}

// CountThreadMessagesByRootIDs returns the active reply count for each root message.
// Counts are intentionally batched because regular history does not include replies.
func (s *Store) CountThreadMessagesByRootIDs(ctx context.Context, chatID string, rootMessageIDs []string) (map[string]int, error) {
	counts := make(map[string]int, len(rootMessageIDs))
	if len(rootMessageIDs) == 0 {
		return counts, nil
	}

	var rows []struct {
		ThreadRootMessageID string `json:"thread_root_message_id"`
		Count               int    `json:"count"`
	}
	if err := s.Client.Message.Query().
		Where(
			message.ChatIDEQ(chatID),
			message.MessageKindEQ("thread"),
			message.ThreadRootMessageIDIn(rootMessageIDs...),
			message.DeletedAtIsNil(),
		).
		GroupBy(message.FieldThreadRootMessageID).
		Aggregate(ent.Count()).
		Scan(ctx, &rows); err != nil {
		return nil, err
	}
	for _, row := range rows {
		counts[row.ThreadRootMessageID] = row.Count
	}
	return counts, nil
}

// MessageCreatedAtInChat returns created_at for a message in a chat.
func (s *Store) MessageCreatedAtInChat(ctx context.Context, messageID, chatID string) (string, error) {
	m, err := s.Client.Message.Query().
		Where(message.IDEQ(messageID), message.ChatIDEQ(chatID)).
		Only(ctx)
	if err != nil {
		return "", err
	}
	return m.CreatedAt, nil
}

// LoadMessage loads a message with chat and sender edges.
func (s *Store) LoadMessage(ctx context.Context, messageID string) (*ent.Message, error) {
	return s.Client.Message.Query().
		Where(message.IDEQ(messageID)).
		WithChat().
		WithSender().
		Only(ctx)
}

// LoadMessageSender returns sender_id and display_name for a message.
func (s *Store) LoadMessageSender(ctx context.Context, messageID string) (senderID string, displayName *string, err error) {
	m, err := s.Client.Message.Query().
		Where(message.IDEQ(messageID)).
		WithSender().
		Only(ctx)
	if err != nil {
		return "", nil, err
	}
	if m.Edges.Sender != nil {
		name := m.Edges.Sender.DisplayName
		return m.SenderID, &name, nil
	}
	return m.SenderID, nil, nil
}

// ListMessageStatuses returns statuses for a message ordered by created_at.
func (s *Store) ListMessageStatuses(ctx context.Context, messageID string) ([]*ent.MessageStatus, error) {
	return s.Client.MessageStatus.Query().
		Where(messagestatus.IDEQ(messageID)).
		Order(messagestatus.ByCreatedAt(sql.OrderAsc())).
		All(ctx)
}

// ListMessageReactions returns reactions for a message ordered by emoji, created_at.
func (s *Store) ListMessageReactions(ctx context.Context, messageID string) ([]*ent.MessageReaction, error) {
	return s.Client.MessageReaction.Query().
		Where(messagereaction.IDEQ(messageID)).
		Order(
			messagereaction.ByEmoji(sql.OrderAsc()),
			messagereaction.ByCreatedAt(sql.OrderAsc()),
		).
		All(ctx)
}

// ListMessageAttachmentFileIDs returns file ids attached to a message.
func (s *Store) ListMessageAttachmentFileIDs(ctx context.Context, messageID string) ([]string, error) {
	rows, err := s.Client.MessageAttachment.Query().
		Where(messageattachment.IDEQ(messageID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.FileID)
	}
	return ids, nil
}

// ActiveMessageMeta is a non-deleted message's id/chat/sender/created_at.
type ActiveMessageMeta struct {
	ID        string
	ChatID    string
	SenderID  string
	CreatedAt string
}

// GetActiveMessageMeta loads id, chat_id, sender_id, created_at for a non-deleted message.
func (s *Store) GetActiveMessageMeta(ctx context.Context, messageID string) (*ActiveMessageMeta, error) {
	m, err := s.Client.Message.Query().
		Where(message.IDEQ(messageID), message.DeletedAtIsNil()).
		Only(ctx)
	if err != nil {
		return nil, err
	}
	return &ActiveMessageMeta{
		ID:        m.ID,
		ChatID:    m.ChatID,
		SenderID:  m.SenderID,
		CreatedAt: m.CreatedAt,
	}, nil
}

// MarkMessagesRead advances last_read and inserts read statuses up through createdAt.
func (s *Store) MarkMessagesRead(ctx context.Context, chatID, userID, messageID, createdAt, statusCreatedAt string, isSender bool) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if _, err := tx.ChatPreference.Update().
			Where(
				chatpreference.IDEQ(chatID),
				chatpreference.UserIDEQ(userID),
				chatpreference.Or(
					chatpreference.LastReadAtIsNil(),
					chatpreference.LastReadAtLT(createdAt),
				),
			).
			SetLastReadMessageID(messageID).
			SetLastReadAt(createdAt).
			Save(ctx); err != nil {
			return err
		}
		if isSender {
			return nil
		}
		rows, err := tx.Message.Query().
			Where(
				message.ChatIDEQ(chatID),
				message.DeletedAtIsNil(),
				message.CreatedAtLTE(createdAt),
				message.SenderIDNEQ(userID),
			).
			All(ctx)
		if err != nil {
			return err
		}
		for _, m := range rows {
			if err := tx.MessageStatus.Create().
				SetID(m.ID).
				SetUserID(userID).
				SetStatus("read").
				SetCreatedAt(statusCreatedAt).
				OnConflictColumns(messagestatus.FieldID, messagestatus.FieldUserID, messagestatus.FieldStatus).
				Ignore().
				Exec(ctx); err != nil {
				return err
			}
		}
		return nil
	})
}

// CreateMessageBundleParams holds fields for inserting a message with statuses and attachments.
type CreateMessageBundleParams struct {
	MessageID              string
	ChatID                 string
	SenderID               string
	Type                   string
	Content                *string
	EncryptionProtocol     string
	Ciphertext             *string
	Nonce                  *string
	KeyVersion             *int
	EncryptionMetadata     *string
	ReplyToMessageID       *string
	ThreadRootMessageID    *string
	MessageKind            string
	ForwardedFromMessageID *string
	ForwardedFromChatID    *string
	CreatedAt              string
	AttachmentFileIDs      []string
	DeliveredRecipientIDs  []string
}

// CreateMessageBundle inserts message, sent status, attachments, chat bump, and delivered statuses.
func (s *Store) CreateMessageBundle(ctx context.Context, p CreateMessageBundleParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		create := tx.Message.Create().
			SetID(p.MessageID).
			SetChatID(p.ChatID).
			SetSenderID(p.SenderID).
			SetType(p.Type).
			SetEncryptionProtocol(p.EncryptionProtocol).
			SetMessageKind(p.MessageKind).
			SetCreatedAt(p.CreatedAt).
			SetUpdatedAt(p.CreatedAt).
			SetNillableContent(p.Content).
			SetNillableCiphertext(p.Ciphertext).
			SetNillableNonce(p.Nonce).
			SetNillableKeyVersion(p.KeyVersion).
			SetNillableEncryptionMetadata(p.EncryptionMetadata).
			SetNillableReplyToMessageID(p.ReplyToMessageID).
			SetNillableThreadRootMessageID(p.ThreadRootMessageID).
			SetNillableForwardedFromMessageID(p.ForwardedFromMessageID).
			SetNillableForwardedFromChatID(p.ForwardedFromChatID)
		if _, err := create.Save(ctx); err != nil {
			return err
		}
		if _, err := tx.MessageStatus.Create().
			SetID(p.MessageID).
			SetUserID(p.SenderID).
			SetStatus("sent").
			SetCreatedAt(p.CreatedAt).
			Save(ctx); err != nil {
			return err
		}
		for _, fileID := range p.AttachmentFileIDs {
			if err := tx.MessageAttachment.Create().
				SetID(p.MessageID).
				SetFileID(fileID).
				// File associations are a set, not a list. Keep message creation
				// idempotent if a client supplies a repeated attachment ID.
				OnConflictColumns(messageattachment.FieldID, messageattachment.FieldFileID).
				Ignore().
				Exec(ctx); err != nil {
				return err
			}
		}
		if _, err := tx.Chat.UpdateOneID(p.ChatID).SetUpdatedAt(p.CreatedAt).Save(ctx); err != nil {
			return err
		}
		for _, recipientID := range p.DeliveredRecipientIDs {
			if err := tx.MessageStatus.Create().
				SetID(p.MessageID).
				SetUserID(recipientID).
				SetStatus("delivered").
				SetCreatedAt(p.CreatedAt).
				OnConflictColumns(messagestatus.FieldID, messagestatus.FieldUserID, messagestatus.FieldStatus).
				Ignore().
				Exec(ctx); err != nil {
				return err
			}
		}
		return nil
	})
}

// AddMessageAttachments associates uploaded files with an existing message. It
// is deliberately idempotent so a client can safely retry a background upload.
func (s *Store) AddMessageAttachments(ctx context.Context, messageID string, fileIDs []string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		for _, fileID := range fileIDs {
			if err := tx.MessageAttachment.Create().
				SetID(messageID).
				SetFileID(fileID).
				OnConflictColumns(messageattachment.FieldID, messageattachment.FieldFileID).
				Ignore().
				Exec(ctx); err != nil {
				return err
			}
		}
		return nil
	})
}

// ActiveMessageExistsInChat reports whether a non-deleted message exists in the chat.
func (s *Store) ActiveMessageExistsInChat(ctx context.Context, messageID, chatID string) (bool, error) {
	n, err := s.Client.Message.Query().
		Where(
			message.IDEQ(messageID),
			message.ChatIDEQ(chatID),
			message.DeletedAtIsNil(),
		).
		Count(ctx)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// SetMessageReaction replaces other emojis for the user and upserts the given emoji.
func (s *Store) SetMessageReaction(ctx context.Context, messageID, userID, emoji, createdAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if _, err := tx.MessageReaction.Delete().
			Where(
				messagereaction.IDEQ(messageID),
				messagereaction.UserIDEQ(userID),
				messagereaction.EmojiNEQ(emoji),
			).
			Exec(ctx); err != nil {
			return err
		}
		return tx.MessageReaction.Create().
			SetID(messageID).
			SetUserID(userID).
			SetEmoji(emoji).
			SetCreatedAt(createdAt).
			OnConflictColumns(messagereaction.FieldID, messagereaction.FieldUserID, messagereaction.FieldEmoji).
			Ignore().
			Exec(ctx)
	})
}

// RemoveMessageReaction deletes a specific emoji reaction for the user.
func (s *Store) RemoveMessageReaction(ctx context.Context, messageID, userID, emoji string) error {
	_, err := s.Client.MessageReaction.Delete().
		Where(
			messagereaction.IDEQ(messageID),
			messagereaction.UserIDEQ(userID),
			messagereaction.EmojiEQ(emoji),
		).
		Exec(ctx)
	return err
}

// UpdateMessagePlainContent sets plaintext content, is_edited, and updated_at.
func (s *Store) UpdateMessagePlainContent(ctx context.Context, messageID, content, updatedAt string) error {
	_, err := s.Client.Message.UpdateOneID(messageID).
		SetContent(content).
		SetIsEdited(true).
		SetUpdatedAt(updatedAt).
		Save(ctx)
	return err
}

// UpdateMessageEncryptedContentParams holds server-at-rest edit fields.
type UpdateMessageEncryptedContentParams struct {
	MessageID          string
	Ciphertext         string
	Nonce              string
	KeyVersion         int
	EncryptionMetadata string
	UpdatedAt          string
}

// UpdateMessageEncryptedContent stores ciphertext and clears plaintext content.
func (s *Store) UpdateMessageEncryptedContent(ctx context.Context, p UpdateMessageEncryptedContentParams) error {
	_, err := s.Client.Message.UpdateOneID(p.MessageID).
		SetCiphertext(p.Ciphertext).
		SetNonce(p.Nonce).
		SetKeyVersion(p.KeyVersion).
		SetEncryptionMetadata(p.EncryptionMetadata).
		ClearContent().
		SetIsEdited(true).
		SetUpdatedAt(p.UpdatedAt).
		Save(ctx)
	return err
}

// SoftDeleteMessage sets deleted_at on a message.
func (s *Store) SoftDeleteMessage(ctx context.Context, messageID, deletedAt string) error {
	_, err := s.Client.Message.UpdateOneID(messageID).
		SetDeletedAt(deletedAt).
		Save(ctx)
	return err
}

// UpsertMessageUserDeletion inserts a per-user deletion (ON CONFLICT DO NOTHING).
func (s *Store) UpsertMessageUserDeletion(ctx context.Context, messageID, userID, deletedAt string) error {
	return s.Client.MessageUserDeletion.Create().
		SetID(messageID).
		SetUserID(userID).
		SetDeletedAt(deletedAt).
		OnConflictColumns(messageuserdeletion.FieldID, messageuserdeletion.FieldUserID).
		Ignore().
		Exec(ctx)
}

// MessageSearchHit is a plaintext search match.
type MessageSearchHit struct {
	ID     string
	ChatID string
}

// SearchPlaintextMessages finds non-deleted messages whose content matches query (case-insensitive).
func (s *Store) SearchPlaintextMessages(ctx context.Context, chatIDs []string, query string, limit int) ([]MessageSearchHit, error) {
	if len(chatIDs) == 0 || limit < 1 {
		return nil, nil
	}
	needle := strings.ToLower(query)
	rows, err := s.Client.Message.Query().
		Where(
			message.ChatIDIn(chatIDs...),
			message.DeletedAtIsNil(),
			message.ContentNotNil(),
			predicate.Message(func(sel *sql.Selector) {
				sel.Where(sql.P(func(b *sql.Builder) {
					b.WriteString("LOWER(").Ident(sel.C(message.FieldContent)).WriteString(") LIKE ").Arg("%" + needle + "%")
				}))
			}),
		).
		Order(message.ByCreatedAt(sql.OrderDesc())).
		Limit(limit).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]MessageSearchHit, 0, len(rows))
	for _, row := range rows {
		out = append(out, MessageSearchHit{ID: row.ID, ChatID: row.ChatID})
	}
	return out, nil
}

// EncryptedMessageSearchCandidate is a server-at-rest encrypted row for client-side decrypt search.
type EncryptedMessageSearchCandidate struct {
	ID         string
	ChatID     string
	Ciphertext string
	Nonce      string
	FamilyID   string
}

// ListEncryptedMessageCandidates returns recent encrypted messages in the given chats.
func (s *Store) ListEncryptedMessageCandidates(ctx context.Context, chatIDs []string, protocol string, limit int) ([]EncryptedMessageSearchCandidate, error) {
	if len(chatIDs) == 0 || limit < 1 {
		return nil, nil
	}
	rows, err := s.Client.Message.Query().
		Where(
			message.ChatIDIn(chatIDs...),
			message.DeletedAtIsNil(),
			message.EncryptionProtocolEQ(protocol),
			message.CiphertextNotNil(),
			message.NonceNotNil(),
		).
		WithChat().
		Order(message.ByCreatedAt(sql.OrderDesc())).
		Limit(limit).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]EncryptedMessageSearchCandidate, 0, len(rows))
	for _, row := range rows {
		if row.Ciphertext == nil || row.Nonce == nil || row.Edges.Chat == nil {
			continue
		}
		out = append(out, EncryptedMessageSearchCandidate{
			ID:         row.ID,
			ChatID:     row.ChatID,
			Ciphertext: *row.Ciphertext,
			Nonce:      *row.Nonce,
			FamilyID:   row.Edges.Chat.FamilyID,
		})
	}
	return out, nil
}

// GetLastUserMessageCreatedAt returns created_at of the most recent non-deleted message by userID in chatID.
func (s *Store) GetLastUserMessageCreatedAt(ctx context.Context, chatID, userID string) (string, error) {
	m, err := s.Client.Message.Query().
		Where(
			message.ChatIDEQ(chatID),
			message.SenderIDEQ(userID),
			message.DeletedAtIsNil(),
		).
		Order(message.ByCreatedAt(sql.OrderDesc())).
		First(ctx)
	if err != nil {
		return "", err
	}
	return m.CreatedAt, nil
}
