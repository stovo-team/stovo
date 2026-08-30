package files

import "context"

// CloneMetadata is the persistence-neutral metadata for a forwarded file.
type CloneMetadata struct {
	ID, FamilyID, UploadedBy, ChatID, AccessScope, StorageProvider, ObjectKey, OriginalName, MimeType, CreatedAt string
	ThumbnailObjectKey                                                                                           *string
	SizeBytes                                                                                                    int64
	Checksum                                                                                                     *string
}

type CloneStore interface {
	CreateClones(context.Context, []CloneMetadata) error
	DeleteClone(context.Context, string) error
}

type CloneService struct{ store CloneStore }

func NewCloneService(store CloneStore) *CloneService { return &CloneService{store: store} }
func (s *CloneService) Create(ctx context.Context, clones []CloneMetadata) error {
	return s.store.CreateClones(ctx, clones)
}
func (s *CloneService) Delete(ctx context.Context, id string) error {
	return s.store.DeleteClone(ctx, id)
}
