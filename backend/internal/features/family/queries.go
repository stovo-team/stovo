package family

import (
	"context"
	"time"
)

// Member is the persistence-neutral member data needed by family-facing use
// cases. It intentionally does not expose an Ent entity to its callers.
type Member struct {
	ID, FamilyID, Username, DisplayName, Role string
	IsActive                                  bool
	PublicKey, LastSeenAt                     *string
	ProfileVisibility, LastSeenVisibility     string
	ReadReceiptsEnabled                       bool
	Email, Bio, Timezone, ProfilePhotoFileID  *string
	AvatarMode, AvatarSymbolID, AvatarColorID   *string
	CreatedAt                                 string
	AudioCallSettings                         *string
}

// Invite is the persistence-neutral representation used when rendering and
// validating family invitations.
type Invite struct {
	ID, FamilyID, Role, CreatedBy string
	ExpiresAt, CreatedAt          time.Time
	MaxUses, UsedCount            int
	RevokedAt                     *time.Time
}

// Details is the persistence-neutral family projection used by inbound
// transports when rendering family settings.
type Details struct {
	ID, Name, DefaultMessageEncryptionProtocol string
	StorageLimitMB                             *int64
	MinimizedChatLayout                        bool
	PublicAppURL, PublicAPIURL                 *string
}

type QueryStore interface {
	ListActiveMembers(context.Context, string, string) ([]Member, error)
	InviteByID(context.Context, string) (Invite, error)
	InviteByTokenHash(context.Context, string) (Invite, error)
	Get(context.Context, string) (Details, error)
}

type QueryService struct{ store QueryStore }

func NewQueryService(store QueryStore) *QueryService { return &QueryService{store: store} }

func (s *QueryService) ListActiveMembers(ctx context.Context, familyID, excludeRole string) ([]Member, error) {
	return s.store.ListActiveMembers(ctx, familyID, excludeRole)
}

func (s *QueryService) InviteByID(ctx context.Context, inviteID string) (Invite, error) {
	return s.store.InviteByID(ctx, inviteID)
}

func (s *QueryService) InviteByTokenHash(ctx context.Context, tokenHash string) (Invite, error) {
	return s.store.InviteByTokenHash(ctx, tokenHash)
}

func (s *QueryService) Get(ctx context.Context, familyID string) (Details, error) {
	return s.store.Get(ctx, familyID)
}
