package repository

import (
	"context"

	"entgo.io/ent/dialect/sql"

	"family-messenger/backend/ent"
	"family-messenger/backend/ent/chat"
	"family-messenger/backend/ent/chatmediaapproval"
	"family-messenger/backend/ent/chatmember"
	"family-messenger/backend/ent/chatpreference"
	"family-messenger/backend/ent/message"
	"family-messenger/backend/ent/messageattachment"
	"family-messenger/backend/ent/predicate"
	"family-messenger/backend/ent/user"
)

// CreateChatParams holds fields for creating a chat with members (and optional preferences).
type CreateChatParams struct {
	ID                 string
	FamilyID           string
	Type               string
	Title              *string
	CreatedBy          string
	MediaVisibility    string
	CommentsEnabled    *bool
	EncryptionProtocol string
	CreatedAt          string
	MemberIDs          []string
	CreatePreferences  bool
}

// CreateChatWithMembers inserts a chat, memberships, and optionally preferences.
func (s *Store) CreateChatWithMembers(ctx context.Context, p CreateChatParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		create := tx.Chat.Create().
			SetID(p.ID).
			SetFamilyID(p.FamilyID).
			SetType(p.Type).
			SetCreatedBy(p.CreatedBy).
			SetMediaVisibility(p.MediaVisibility).
			SetEncryptionProtocol(p.EncryptionProtocol).
			SetCreatedAt(p.CreatedAt).
			SetUpdatedAt(p.CreatedAt)
		if p.Title != nil {
			create.SetTitle(*p.Title)
		}
		if p.CommentsEnabled != nil {
			create.SetCommentsEnabled(*p.CommentsEnabled)
		}
		if _, err := create.Save(ctx); err != nil {
			return err
		}
		for _, memberID := range p.MemberIDs {
			if _, err := tx.ChatMember.Create().
				SetID(p.ID).
				SetUserID(memberID).
				SetCreatedAt(p.CreatedAt).
				Save(ctx); err != nil {
				return err
			}
			if p.CreatePreferences {
				if _, err := tx.ChatPreference.Create().
					SetID(p.ID).
					SetUserID(memberID).
					Save(ctx); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// UpdateChatTitle sets title and updated_at.
func (s *Store) UpdateChatTitle(ctx context.Context, chatID, title, updatedAt string) error {
	_, err := s.Client.Chat.UpdateOneID(chatID).
		SetTitle(title).
		SetUpdatedAt(updatedAt).
		Save(ctx)
	return err
}

// UpdateChatPhoto sets or clears chat_photo_file_id and bumps updated_at.
func (s *Store) UpdateChatPhoto(ctx context.Context, chatID string, photoFileID *string, updatedAt string) error {
	upd := s.Client.Chat.UpdateOneID(chatID).SetUpdatedAt(updatedAt)
	if photoFileID == nil || *photoFileID == "" {
		upd.ClearChatPhotoFileID()
	} else {
		upd.SetChatPhotoFileID(*photoFileID)
	}
	_, err := upd.Save(ctx)
	return err
}

// UpdateChatCommentsEnabled sets comments_enabled and updated_at.
func (s *Store) UpdateChatCommentsEnabled(ctx context.Context, chatID string, enabled bool, updatedAt string) error {
	_, err := s.Client.Chat.UpdateOneID(chatID).
		SetCommentsEnabled(enabled).
		SetUpdatedAt(updatedAt).
		Save(ctx)
	return err
}

// UpdateChatPinPermission sets pin_permission and updated_at.
func (s *Store) UpdateChatPinPermission(ctx context.Context, chatID, permission, updatedAt string) error {
	_, err := s.Client.Chat.UpdateOneID(chatID).
		SetPinPermission(permission).
		SetUpdatedAt(updatedAt).
		Save(ctx)
	return err
}

// UpdateChatPreferencesParams holds optional preference field updates.
type UpdateChatPreferencesParams struct {
	ChatID          string
	UserID          string
	IsMuted         *bool
	IsPinned        *bool
	IsFavorite      *bool
	WallpaperFileID *string // non-nil pointer means set; empty string clears
	ClearWallpaper  bool
}

// UpdateChatPreferences applies partial preference updates for a member.
func (s *Store) UpdateChatPreferences(ctx context.Context, p UpdateChatPreferencesParams) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if p.IsMuted != nil {
			if _, err := tx.ChatPreference.Update().
				Where(chatpreference.IDEQ(p.ChatID), chatpreference.UserIDEQ(p.UserID)).
				SetIsMuted(*p.IsMuted).
				Save(ctx); err != nil {
				return err
			}
		}
		if p.IsPinned != nil {
			if _, err := tx.ChatPreference.Update().
				Where(chatpreference.IDEQ(p.ChatID), chatpreference.UserIDEQ(p.UserID)).
				SetIsPinned(*p.IsPinned).
				Save(ctx); err != nil {
				return err
			}
		}
		if p.IsFavorite != nil {
			if _, err := tx.ChatPreference.Update().
				Where(chatpreference.IDEQ(p.ChatID), chatpreference.UserIDEQ(p.UserID)).
				SetIsFavorite(*p.IsFavorite).
				Save(ctx); err != nil {
				return err
			}
		}
		if p.ClearWallpaper {
			if _, err := tx.ChatPreference.Update().
				Where(chatpreference.IDEQ(p.ChatID), chatpreference.UserIDEQ(p.UserID)).
				ClearWallpaperFileID().
				Save(ctx); err != nil {
				return err
			}
		} else if p.WallpaperFileID != nil {
			if _, err := tx.ChatPreference.Update().
				Where(chatpreference.IDEQ(p.ChatID), chatpreference.UserIDEQ(p.UserID)).
				SetWallpaperFileID(*p.WallpaperFileID).
				Save(ctx); err != nil {
				return err
			}
		}
		return nil
	})
}

// ListChatIDsForUser returns chat_ids the user belongs to.
func (s *Store) ListChatIDsForUser(ctx context.Context, userID string) ([]string, error) {
	members, err := s.Client.ChatMember.Query().
		Where(chatmember.UserIDEQ(userID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(members))
	for _, m := range members {
		ids = append(ids, m.ID)
	}
	return ids, nil
}

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
			}),
		).
		Only(ctx)
	if err != nil {
		return "", err
	}
	return c.ID, nil
}

// ChatForMember is a chat row plus optional per-user preference.
type ChatForMember struct {
	Chat       *ent.Chat
	Preference *ent.ChatPreference
}

// GetChatForMember loads a chat the user is a member of, with preferences.
func (s *Store) GetChatForMember(ctx context.Context, chatID, userID string) (*ChatForMember, error) {
	n, err := s.Client.ChatMember.Query().
		Where(chatmember.IDEQ(chatID), chatmember.UserIDEQ(userID)).
		Count(ctx)
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, &ent.NotFoundError{}
	}
	c, err := s.Client.Chat.Get(ctx, chatID)
	if err != nil {
		return nil, err
	}
	out := &ChatForMember{Chat: c}
	pref, err := s.Client.ChatPreference.Query().
		Where(chatpreference.IDEQ(chatID), chatpreference.UserIDEQ(userID)).
		Only(ctx)
	if err == nil {
		out.Preference = pref
	} else if !ent.IsNotFound(err) {
		return nil, err
	}
	return out, nil
}

// ListChatsForUser loads all chats a user belongs to and attaches per-user preferences.
func (s *Store) ListChatsForUser(ctx context.Context, userID string) ([]*ChatForMember, error) {
	chats, err := s.Client.Chat.Query().
		Where(
			predicate.Chat(func(sel *sql.Selector) {
				cm := sql.Table(chatmember.Table)
				sel.Join(cm).On(sel.C(chat.FieldID), cm.C(chatmember.FieldID))
				sel.Where(sql.EQ(cm.C(chatmember.FieldUserID), userID))
			}),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(chats) == 0 {
		return nil, nil
	}
	chatIDs := make([]string, 0, len(chats))
	for _, c := range chats {
		chatIDs = append(chatIDs, c.ID)
	}
	prefs, err := s.Client.ChatPreference.Query().
		Where(
			chatpreference.UserIDEQ(userID),
			chatpreference.IDIn(chatIDs...),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	prefByChatID := make(map[string]*ent.ChatPreference, len(prefs))
	for _, p := range prefs {
		prefByChatID[p.ID] = p
	}
	out := make([]*ChatForMember, 0, len(chats))
	for _, c := range chats {
		out = append(out, &ChatForMember{
			Chat:       c,
			Preference: prefByChatID[c.ID],
		})
	}
	return out, nil
}

// LastMessagePreview holds the latest non-deleted chat-kind message summary.
type LastMessagePreview struct {
	ID              string
	SenderID        string
	SenderName      *string
	Type            string
	Content         *string
	CreatedAt       string
	AttachmentCount int
}

// GetLastMessagePreview returns the newest chat-kind message for a chat, if any.
func (s *Store) GetLastMessagePreview(ctx context.Context, chatID string) (*LastMessagePreview, error) {
	m, err := s.Client.Message.Query().
		Where(
			message.ChatIDEQ(chatID),
			message.DeletedAtIsNil(),
			message.MessageKindEQ("chat"),
		).
		WithSender().
		Order(message.ByCreatedAt(sql.OrderDesc())).
		First(ctx)
	if err != nil {
		return nil, err
	}
	count, err := s.Client.MessageAttachment.Query().
		Where(messageattachment.IDEQ(m.ID)).
		Count(ctx)
	if err != nil {
		return nil, err
	}
	preview := &LastMessagePreview{
		ID:              m.ID,
		SenderID:        m.SenderID,
		Type:            m.Type,
		Content:         m.Content,
		CreatedAt:       m.CreatedAt,
		AttachmentCount: count,
	}
	if m.Edges.Sender != nil {
		name := m.Edges.Sender.DisplayName
		preview.SenderName = &name
	}
	return preview, nil
}

// ListActiveChatMemberUsers returns active users who are members of the chat.
func (s *Store) ListActiveChatMemberUsers(ctx context.Context, chatID string) ([]*ent.User, error) {
	return s.Client.User.Query().
		Where(
			user.IsActiveEQ(1),
			predicate.User(func(sel *sql.Selector) {
				cm := sql.Table(chatmember.Table)
				sel.Join(cm).On(sel.C(user.FieldID), cm.C(chatmember.FieldUserID))
				sel.Where(sql.EQ(cm.C(chatmember.FieldID), chatID))
			}),
		).
		Order(user.ByDisplayName(sql.OrderAsc())).
		All(ctx)
}

// UnreadMessageCount counts messages newer than the user's last_read_at (or all if unset).
func (s *Store) UnreadMessageCount(ctx context.Context, chatID, userID string) (int, error) {
	pref, err := s.Client.ChatPreference.Query().
		Where(chatpreference.IDEQ(chatID), chatpreference.UserIDEQ(userID)).
		Only(ctx)
	var lastReadAt *string
	if err == nil {
		lastReadAt = pref.LastReadAt
	} else if !ent.IsNotFound(err) {
		return 0, err
	}

	q := s.Client.Message.Query().Where(
		message.ChatIDEQ(chatID),
		message.SenderIDNEQ(userID),
		message.DeletedAtIsNil(),
	)
	if lastReadAt != nil {
		q = q.Where(message.CreatedAtGT(*lastReadAt))
	}
	return q.Count(ctx)
}

// ListMediaApprovalUserIDs returns user_ids that approved family media visibility.
func (s *Store) ListMediaApprovalUserIDs(ctx context.Context, chatID string) ([]string, error) {
	rows, err := s.Client.ChatMediaApproval.Query().
		Where(chatmediaapproval.IDEQ(chatID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.UserID)
	}
	return ids, nil
}

// ListDirectChatIDs returns all direct chat ids.
func (s *Store) ListDirectChatIDs(ctx context.Context) ([]string, error) {
	chats, err := s.Client.Chat.Query().
		Where(chat.TypeEQ("direct")).
		All(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(chats))
	for _, c := range chats {
		ids = append(ids, c.ID)
	}
	return ids, nil
}

// SetChatMediaVisibility clears approvals and sets media_visibility.
func (s *Store) SetChatMediaVisibility(ctx context.Context, chatID, visibility, updatedAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if _, err := tx.Chat.UpdateOneID(chatID).
			SetMediaVisibility(visibility).
			SetUpdatedAt(updatedAt).
			Save(ctx); err != nil {
			return err
		}
		_, err := tx.ChatMediaApproval.Delete().
			Where(chatmediaapproval.IDEQ(chatID)).
			Exec(ctx)
		return err
	})
}

// ApproveDirectMediaVisibility upserts the user's approval and promotes to family when both approve.
func (s *Store) ApproveDirectMediaVisibility(ctx context.Context, chatID, userID, createdAt, updatedAt string) error {
	return s.WithTx(ctx, func(tx *ent.Tx) error {
		if err := tx.ChatMediaApproval.Create().
			SetID(chatID).
			SetUserID(userID).
			SetCreatedAt(createdAt).
			OnConflictColumns(chatmediaapproval.FieldID, chatmediaapproval.FieldUserID).
			DoNothing().
			Exec(ctx); err != nil {
			return err
		}
		count, err := tx.ChatMediaApproval.Query().
			Where(chatmediaapproval.IDEQ(chatID)).
			Count(ctx)
		if err != nil {
			return err
		}
		visibility := "members"
		if count >= 2 {
			visibility = "family"
		}
		_, err = tx.Chat.UpdateOneID(chatID).
			SetMediaVisibility(visibility).
			SetUpdatedAt(updatedAt).
			Save(ctx)
		return err
	})
}
