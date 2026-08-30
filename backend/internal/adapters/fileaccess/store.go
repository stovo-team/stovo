package fileaccess

import (
	"context"

	featurefiles "stovo-messenger/backend/internal/features/files"
	"stovo-messenger/backend/internal/repository"
)

type Store struct{ repository *repository.Store }

func NewStore(repository *repository.Store) *Store { return &Store{repository: repository} }

func (s *Store) LoadAccessRecord(ctx context.Context, fileID, viewerID string) (featurefiles.AccessRecord, error) {
	detail, err := s.repository.LoadFileDetail(ctx, fileID, viewerID)
	if err != nil {
		return featurefiles.AccessRecord{}, err
	}
	f := detail.File
	return featurefiles.AccessRecord{ID: f.ID, FamilyID: f.FamilyID, UploadedBy: f.UploadedBy, ChatID: f.ChatID, ChatTitle: detail.ChatTitle, ChatType: detail.ChatType, OriginMessageID: detail.OriginMessageID, AccessScope: f.AccessScope, StorageProvider: f.StorageProvider, ObjectKey: f.ObjectKey, ThumbnailObjectKey: f.ThumbnailObjectKey, OriginalName: f.OriginalName, MimeType: f.MimeType, SizeBytes: int64(f.SizeBytes), Checksum: f.Checksum, CreatedAt: f.CreatedAt, DeletedAt: f.DeletedAt, IsFavorite: detail.IsFavorite}, nil
}

func (s *Store) ChatMediaVisibility(ctx context.Context, chatID string) (string, error) {
	return s.repository.ChatMediaVisibility(ctx, chatID)
}

func (s *Store) IsChatMember(ctx context.Context, chatID, userID string) (bool, error) {
	return s.repository.IsChatMember(ctx, chatID, userID)
}

var _ featurefiles.AccessStore = (*Store)(nil)
