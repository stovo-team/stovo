package family

import "context"

// ProfilePatch represents mutable family settings without exposing an Ent
// model or persistence parameter object to HTTP code.
type ProfilePatch struct {
	Name                *string
	StorageLimitMB      *int64
	MinimizedChatLayout *bool
	UpdatedAt           string
}

type ProfileStore interface {
	UpdateProfile(context.Context, string, ProfilePatch) error
}

type ProfileService struct{ store ProfileStore }

func NewProfileService(store ProfileStore) *ProfileService { return &ProfileService{store: store} }

func (s *ProfileService) Update(ctx context.Context, familyID string, patch ProfilePatch) error {
	return s.store.UpdateProfile(ctx, familyID, patch)
}
