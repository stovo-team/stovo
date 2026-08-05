package repository

import (
	"context"
	"time"

	"entgo.io/ent/dialect/sql"
	"entgo.io/ent/dialect/sql/sqlgraph"

	"family-messenger/backend/ent"
	"family-messenger/backend/ent/message"
	"family-messenger/backend/ent/pinnedmessage"
	"family-messenger/backend/ent/predicate"
)

// MessageChatIDIfActive returns the chat id for a non-deleted message.
func (s *Store) MessageChatIDIfActive(ctx context.Context, messageID string) (string, error) {
	m, err := s.Client.Message.Query().
		Where(
			message.IDEQ(messageID),
			message.DeletedAtIsNil(),
		).
		Only(ctx)
	if err != nil {
		return "", err
	}
	return m.ChatID, nil
}

// TryPinMessage creates a pin; returns created=false when the pin already exists.
func (s *Store) TryPinMessage(ctx context.Context, chatID, messageID, pinnedBy string, pinnedAt time.Time) (bool, error) {
	_, err := s.Client.PinnedMessage.Create().
		SetID(chatID).
		SetMessageID(messageID).
		SetPinnedBy(pinnedBy).
		SetPinnedAt(pinnedAt).
		Save(ctx)
	if err == nil {
		return true, nil
	}
	if sqlgraph.IsConstraintError(err) {
		return false, nil
	}
	return false, err
}

// GetPin loads a pin by chat and message id.
func (s *Store) GetPin(ctx context.Context, chatID, messageID string) (*ent.PinnedMessage, error) {
	return s.Client.PinnedMessage.Query().
		Where(
			pinnedmessage.IDEQ(chatID),
			pinnedmessage.MessageIDEQ(messageID),
		).
		Only(ctx)
}

// DeletePin removes a pin by chat and message id.
func (s *Store) DeletePin(ctx context.Context, chatID, messageID string) error {
	_, err := s.Client.PinnedMessage.Delete().
		Where(
			pinnedmessage.IDEQ(chatID),
			pinnedmessage.MessageIDEQ(messageID),
		).
		Exec(ctx)
	return err
}

// ListActivePins returns pins whose message is not soft-deleted, ordered pinned_at desc.
func (s *Store) ListActivePins(ctx context.Context, chatID string) ([]*ent.PinnedMessage, error) {
	return s.Client.PinnedMessage.Query().
		Where(
			pinnedmessage.IDEQ(chatID),
			predicate.PinnedMessage(func(sel *sql.Selector) {
				m := sql.Table(message.Table)
				sel.Join(m).On(sel.C(pinnedmessage.FieldMessageID), m.C(message.FieldID))
				sel.Where(sql.IsNull(m.C(message.FieldDeletedAt)))
			}),
		).
		Order(pinnedmessage.ByPinnedAt(sql.OrderDesc())).
		All(ctx)
}
