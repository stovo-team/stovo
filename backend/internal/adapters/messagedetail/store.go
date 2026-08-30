package messagedetail

import (
	"context"

	featuremessages "stovo-messenger/backend/internal/features/messages"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) LoadDetail(ctx context.Context, messageID string) (featuremessages.Detail, error) {
	m, err := s.repository.LoadMessage(ctx, messageID)
	if err != nil {
		return featuremessages.Detail{}, err
	}
	d := featuremessages.Detail{ID: m.ID, ChatID: m.ChatID, SenderID: m.SenderID, Type: m.Type, Content: m.Content, EncryptionProtocol: m.EncryptionProtocol, Ciphertext: m.Ciphertext, Nonce: m.Nonce, EncryptionMetadata: m.EncryptionMetadata, KeyVersion: m.KeyVersion, ReplyToMessageID: m.ReplyToMessageID, ThreadRootMessageID: m.ThreadRootMessageID, MessageKind: m.MessageKind, ForwardedFromMessageID: m.ForwardedFromMessageID, ForwardedFromChatID: m.ForwardedFromChatID, CreatedAt: m.CreatedAt, UpdatedAt: m.UpdatedAt, DeletedAt: m.DeletedAt, IsEdited: m.IsEdited}
	if m.Edges.Chat != nil {
		d.ChatFound = true
		d.FamilyID = m.Edges.Chat.FamilyID
	}
	if m.Edges.Sender != nil {
		name := m.Edges.Sender.DisplayName
		d.SenderDisplayName = &name
	}
	return d, nil
}
func (s *Store) LoadSender(ctx context.Context, messageID string) (featuremessages.Sender, error) {
	id, name, err := s.repository.LoadMessageSender(ctx, messageID)
	return featuremessages.Sender{ID: id, DisplayName: name}, err
}
func (s *Store) ListStatuses(ctx context.Context, messageID string) ([]featuremessages.Status, error) {
	rows, err := s.repository.ListMessageStatuses(ctx, messageID)
	if err != nil {
		return nil, err
	}
	result := make([]featuremessages.Status, 0, len(rows))
	for _, row := range rows {
		result = append(result, featuremessages.Status{UserID: row.UserID, Status: row.Status, CreatedAt: row.CreatedAt})
	}
	return result, nil
}
func (s *Store) ListReactions(ctx context.Context, messageID string) ([]featuremessages.Reaction, error) {
	rows, err := s.repository.ListMessageReactions(ctx, messageID)
	if err != nil {
		return nil, err
	}
	result := make([]featuremessages.Reaction, 0, len(rows))
	for _, row := range rows {
		result = append(result, featuremessages.Reaction{UserID: row.UserID, Emoji: row.Emoji})
	}
	return result, nil
}
func (s *Store) ListAttachmentFileIDs(ctx context.Context, messageID string) ([]string, error) {
	return s.repository.ListMessageAttachmentFileIDs(ctx, messageID)
}

var _ featuremessages.DetailStore = (*Store)(nil)
