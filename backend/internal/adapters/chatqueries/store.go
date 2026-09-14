package chatqueries

import (
	"context"

	featurechats "stovo-messenger/backend/internal/features/chats"
	"stovo-messenger/backend/internal/repository"
)

// Store maps legacy Ent-backed repository rows into chats feature results.
type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) GetForMember(ctx context.Context, chatID, userID string) (featurechats.ChatDetails, error) {
	row, err := s.repository.GetChatForMember(ctx, chatID, userID)
	if err != nil {
		return featurechats.ChatDetails{}, err
	}
	return mapDetails(row), nil
}

func (s *Store) ListForUser(ctx context.Context, userID string) ([]featurechats.ChatDetails, error) {
	rows, err := s.repository.ListChatsForUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]featurechats.ChatDetails, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapDetails(row))
	}
	return out, nil
}

func (s *Store) Type(ctx context.Context, chatID string) (string, error) {
	return s.repository.ChatType(ctx, chatID)
}

func mapDetails(row *repository.ChatForMember) featurechats.ChatDetails {
	c := row.Chat
	out := featurechats.ChatDetails{ID: c.ID, FamilyID: c.FamilyID, Type: c.Type, Title: c.Title, Description: c.Description, CreatedBy: c.CreatedBy, ChatPhotoFileID: c.ChatPhotoFileID, MediaVisibility: c.MediaVisibility, CommentsEnabled: c.CommentsEnabled, EncryptionProtocol: c.EncryptionProtocol, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt, PinPermission: c.PinPermission, MessageDelaySeconds: c.MessageDelaySeconds}
	if p := row.Preference; p != nil {
		out.Preference = &featurechats.ChatPreference{IsMuted: p.IsMuted, IsPinned: p.IsPinned, IsFavorite: p.IsFavorite, WallpaperFileID: p.WallpaperFileID}
	}
	return out
}

var _ featurechats.QueryStore = (*Store)(nil)
