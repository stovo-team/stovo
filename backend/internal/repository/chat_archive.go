package repository

import (
	"context"

	"entgo.io/ent/dialect/sql"

	"stovo-messenger/backend/ent/chat"
	"stovo-messenger/backend/ent/chatmember"
	"stovo-messenger/backend/ent/predicate"
)

// FindArchiveChatID returns the user's archive chat id for a family, if any.
func (s *Store) FindArchiveChatID(ctx context.Context, familyID, userID string) (string, error) {
	c, err := s.Client.Chat.Query().
		Where(
			chat.FamilyIDEQ(familyID),
			chat.TypeEQ("archive"),
			predicate.Chat(func(sel *sql.Selector) {
				cm := sql.Table(chatmember.Table)
				sel.Join(cm).On(sel.C(chat.FieldID), cm.C(chatmember.FieldID))
				sel.Where(sql.EQ(cm.C(chatmember.FieldUserID), userID))
				imports := sql.Table("chat_import_batches")
				subquery := sql.Select(imports.C("chat_id")).From(imports).Where(sql.ColumnsEQ(imports.C("chat_id"), sel.C(chat.FieldID)))
				sel.Where(sql.NotIn(sel.C(chat.FieldID), subquery))
			}),
		).
		Only(ctx)
	if err != nil {
		return "", err
	}
	return c.ID, nil
}
