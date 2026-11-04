package repository

import (
	"context"

	"entgo.io/ent/dialect/sql"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/chat"
	"stovo-messenger/backend/ent/chatmember"
	"stovo-messenger/backend/ent/predicate"
	"stovo-messenger/backend/ent/user"
)

// FindArchiveChatID returns the user's archive chat id for a family, if any.
func (s *Store) FindArchiveChatID(ctx context.Context, familyID, userID string) (string, error) {
	return findArchiveChatID(ctx, s.Client, familyID, userID)
}

func findArchiveChatID(ctx context.Context, client *ent.Client, familyID, userID string) (string, error) {
	c, err := client.Chat.Query().
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
		Order(chat.ByCreatedAt(), chat.ByID()).
		First(ctx)
	if err != nil {
		return "", err
	}
	return c.ID, nil
}

// EnsureArchiveChatID serializes the lookup and creation across backend instances.
func (s *Store) EnsureArchiveChatID(ctx context.Context, p CreateChatParams) (string, error) {
	var archiveID string
	err := s.WithTx(ctx, func(tx *ent.Tx) error {
		// Lock the user's row before the lookup; all creators for this user must
		// hold the same lock until their archive and membership are committed.
		_, err := tx.User.Query().Where(user.IDEQ(p.CreatedBy), predicate.User(func(sel *sql.Selector) {
			sel.ForUpdate()
		})).Only(ctx)
		if err != nil {
			return err
		}
		archiveID, err = findArchiveChatID(ctx, tx.Client(), p.FamilyID, p.CreatedBy)
		if err == nil {
			return nil
		}
		if !ent.IsNotFound(err) {
			return err
		}
		create := tx.Chat.Create().SetID(p.ID).SetFamilyID(p.FamilyID).SetType("archive").
			SetCreatedBy(p.CreatedBy).SetMediaVisibility(p.MediaVisibility).
			SetEncryptionProtocol(p.EncryptionProtocol).SetCreatedAt(p.CreatedAt).SetUpdatedAt(p.CreatedAt)
		if p.Title != nil {
			create.SetTitle(*p.Title)
		}
		if _, err := create.Save(ctx); err != nil {
			return err
		}
		if err := tx.ChatMember.Create().SetID(p.ID).SetUserID(p.CreatedBy).SetCreatedAt(p.CreatedAt).Exec(ctx); err != nil {
			return err
		}
		archiveID = p.ID
		return nil
	})
	return archiveID, err
}
