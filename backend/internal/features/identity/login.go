package identity

import "context"

// LoginAccount is the persistence-neutral account snapshot needed by login
// and password verification flows. PasswordHash is deliberately kept separate
// from transport responses and is only returned to the application boundary.
type LoginAccount struct {
	ID, FamilyID, Username, PasswordHash, DisplayName, Role string
	IsActive                                                bool
	PublicKey, ProfilePhotoFileID                           *string
	CreatedAt                                               string
	LastSeenAt                                              *string
	ProfileVisibility, LastSeenVisibility                   string
	ReadReceiptsEnabled                                     bool
	AudioCallSettings, Email, Bio, Timezone                 *string
}

// LoginAccountStore is owned by the identity feature because it is consumed
// by identity authentication use cases, rather than by a global repository.
type LoginAccountStore interface {
	LoginAccountByUsername(context.Context, string) (LoginAccount, error)
	LoginAccountByID(context.Context, string) (LoginAccount, error)
}

type LoginAccountService struct{ store LoginAccountStore }

func NewLoginAccountService(store LoginAccountStore) *LoginAccountService {
	return &LoginAccountService{store: store}
}

func (s *LoginAccountService) ByUsername(ctx context.Context, username string) (LoginAccount, error) {
	return s.store.LoginAccountByUsername(ctx, username)
}

// ByID returns the same neutral account projection used by authentication
// middleware without exposing an Ent user to the transport layer.
func (s *LoginAccountService) ByID(ctx context.Context, id string) (LoginAccount, error) {
	return s.store.LoginAccountByID(ctx, id)
}
