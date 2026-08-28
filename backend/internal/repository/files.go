package repository

import (
	"context"

	"entgo.io/ent/dialect/sql"

	"stovo-messenger/backend/ent"
	"stovo-messenger/backend/ent/chat"
	"stovo-messenger/backend/ent/chatmember"
	"stovo-messenger/backend/ent/file"
	"stovo-messenger/backend/ent/filepreference"
	"stovo-messenger/backend/ent/messageattachment"
)

// CreateFileParams holds fields for inserting a file row.
type CreateFileParams struct {
	ID                 string
	FamilyID           string
	UploadedBy         string
	ChatID             *string
	AccessScope        string
	StorageProvider    string
	ObjectKey          string
	ThumbnailObjectKey *string
	OriginalName       string
	MimeType           string
	SizeBytes          int
	Checksum           *string
	CreatedAt          string
}

// CreateFile inserts a files row (optionally inside tx).
func (s *Store) CreateFile(ctx context.Context, tx *ent.Tx, p CreateFileParams) error {
	create := s.client(tx).File.Create().
		SetID(p.ID).
		SetFamilyID(p.FamilyID).
		SetUploadedBy(p.UploadedBy).
		SetAccessScope(p.AccessScope).
		SetStorageProvider(p.StorageProvider).
		SetObjectKey(p.ObjectKey).
		SetOriginalName(p.OriginalName).
		SetMimeType(p.MimeType).
		SetSizeBytes(p.SizeBytes).
		SetNillableChecksum(p.Checksum).
		SetCreatedAt(p.CreatedAt)
	if p.ChatID != nil {
		create.SetChatID(*p.ChatID)
	}
	if p.ThumbnailObjectKey != nil {
		create.SetThumbnailObjectKey(*p.ThumbnailObjectKey)
	}
	_, err := create.Save(ctx)
	return err
}

// SoftDeleteFile sets deleted_at on a file.
func (s *Store) SoftDeleteFile(ctx context.Context, tx *ent.Tx, fileID, deletedAt string) error {
	_, err := s.client(tx).File.UpdateOneID(fileID).SetDeletedAt(deletedAt).Save(ctx)
	return err
}

// HardDeleteFile permanently removes a files row.
func (s *Store) HardDeleteFile(ctx context.Context, fileID string) error {
	return s.Client.File.DeleteOneID(fileID).Exec(ctx)
}

// UpsertFileFavorite inserts or updates file_preferences.is_favorite.
func (s *Store) UpsertFileFavorite(ctx context.Context, tx *ent.Tx, fileID, userID string, isFavorite bool) error {
	return s.client(tx).FilePreference.Create().
		SetID(fileID).
		SetUserID(userID).
		SetIsFavorite(isFavorite).
		OnConflict(
			sql.ConflictColumns(filepreference.FieldID, filepreference.FieldUserID),
		).
		Update(func(u *ent.FilePreferenceUpsert) {
			u.SetIsFavorite(isFavorite)
		}).
		Exec(ctx)
}

// FileDetail is a file row with optional join data used by file handlers.
type FileDetail struct {
	File            *ent.File
	ChatTitle       *string
	ChatType        *string
	OriginMessageID *string
	IsFavorite      bool
}

// LoadFileDetail loads a file with chat metadata, origin message, and viewer preference.
func (s *Store) LoadFileDetail(ctx context.Context, fileID, viewerID string) (*FileDetail, error) {
	f, err := s.Client.File.Query().
		Where(file.IDEQ(fileID)).
		WithChat().
		Only(ctx)
	if err != nil {
		return nil, err
	}
	detail := &FileDetail{File: f}
	if f.Edges.Chat != nil {
		detail.ChatTitle = f.Edges.Chat.Title
		t := f.Edges.Chat.Type
		detail.ChatType = &t
	}
	att, err := s.Client.MessageAttachment.Query().
		Where(messageattachment.FileIDEQ(fileID)).
		First(ctx)
	if err == nil {
		id := att.ID // message_id (StorageKey)
		detail.OriginMessageID = &id
	} else if !ent.IsNotFound(err) {
		return nil, err
	}
	pref, err := s.Client.FilePreference.Query().
		Where(
			filepreference.IDEQ(fileID),
			filepreference.UserIDEQ(viewerID),
		).
		Only(ctx)
	if err == nil {
		detail.IsFavorite = pref.IsFavorite
	} else if !ent.IsNotFound(err) {
		return nil, err
	}
	return detail, nil
}

// ListVisibleFamilyFileIDs returns non-deleted family files that are either
// chat-unscoped or attached to a message, newest first.
func (s *Store) ListVisibleFamilyFileIDs(ctx context.Context, familyID string) ([]string, error) {
	files, err := s.Client.File.Query().
		Where(
			file.FamilyIDEQ(familyID),
			file.DeletedAtIsNil(),
		).
		Order(ent.Desc(file.FieldCreatedAt)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	chatScoped := make([]string, 0)
	for _, f := range files {
		if f.ChatID != nil {
			chatScoped = append(chatScoped, f.ID)
		}
	}
	attached := map[string]struct{}{}
	if len(chatScoped) > 0 {
		atts, err := s.Client.MessageAttachment.Query().
			Where(messageattachment.FileIDIn(chatScoped...)).
			All(ctx)
		if err != nil {
			return nil, err
		}
		for _, a := range atts {
			attached[a.FileID] = struct{}{}
		}
	}
	out := make([]string, 0, len(files))
	for _, f := range files {
		if f.ChatID == nil {
			out = append(out, f.ID)
			continue
		}
		if _, ok := attached[f.ID]; ok {
			out = append(out, f.ID)
		}
	}
	return out, nil
}

// ChatMediaVisibility returns chats.media_visibility.
func (s *Store) ChatMediaVisibility(ctx context.Context, chatID string) (string, error) {
	c, err := s.Client.Chat.Query().
		Where(chat.IDEQ(chatID)).
		Only(ctx)
	if err != nil {
		return "", err
	}
	return c.MediaVisibility, nil
}

// IsChatMember reports whether userID is a member of chatID.
func (s *Store) IsChatMember(ctx context.Context, chatID, userID string) (bool, error) {
	n, err := s.Client.ChatMember.Query().
		Where(
			chatmember.IDEQ(chatID),
			chatmember.UserIDEQ(userID),
		).
		Count(ctx)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// ListChatFileIDs returns non-deleted file IDs for a family+chat, newest first.
func (s *Store) ListChatFileIDs(ctx context.Context, familyID, chatID string, limit int) ([]string, error) {
	rows, err := s.Client.File.Query().
		Where(
			file.FamilyIDEQ(familyID),
			file.ChatIDEQ(chatID),
			file.DeletedAtIsNil(),
		).
		Order(file.ByCreatedAt(sql.OrderDesc())).
		Limit(limit).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		out = append(out, row.ID)
	}
	return out, nil
}

// ChatType returns chats.type for chatID.
func (s *Store) ChatType(ctx context.Context, chatID string) (string, error) {
	c, err := s.Client.Chat.Query().
		Where(chat.IDEQ(chatID)).
		Only(ctx)
	if err != nil {
		return "", err
	}
	return c.Type, nil
}
