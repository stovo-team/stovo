package files

import "context"

// AccessRecord is the persistence-neutral metadata needed to present and
// authorize a file. ObjectKey intentionally stays out of HTTP responses.
type AccessRecord struct {
	ID                 string
	FamilyID           string
	UploadedBy         string
	ChatID             *string
	ChatTitle          *string
	ChatType           *string
	OriginMessageID    *string
	AccessScope        string
	StorageProvider    string
	ObjectKey          string
	ThumbnailObjectKey *string
	OriginalName       string
	MimeType           string
	SizeBytes          int64
	Checksum           *string
	CreatedAt          string
	DeletedAt          *string
	IsFavorite         bool
}

// AccessStore is owned by the files feature; adapters supply persistence and
// membership details without exposing Ent or repository types to callers.
type AccessStore interface {
	LoadAccessRecord(context.Context, string, string) (AccessRecord, error)
	ChatMediaVisibility(context.Context, string) (string, error)
	IsChatMember(context.Context, string, string) (bool, error)
}

type AccessService struct{ store AccessStore }

func NewAccessService(store AccessStore) *AccessService { return &AccessService{store: store} }

func (s *AccessService) Load(ctx context.Context, fileID, viewerID string) (AccessRecord, error) {
	return s.store.LoadAccessRecord(ctx, fileID, viewerID)
}

func (s *AccessService) VisibleTo(ctx context.Context, record AccessRecord, viewerFamilyID, viewerID string) bool {
	if record.FamilyID != viewerFamilyID {
		return false
	}
	if record.ChatID == nil {
		return true
	}
	visibility, err := s.store.ChatMediaVisibility(ctx, *record.ChatID)
	if err != nil {
		return false
	}
	if visibility == "family" {
		return true
	}
	member, memberErr := s.store.IsChatMember(ctx, *record.ChatID, viewerID)
	return memberErr == nil && member
}
