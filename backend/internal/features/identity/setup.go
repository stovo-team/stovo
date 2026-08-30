package identity

import "context"

// SetupCommand contains all infrastructure-free values that must commit with
// provisioning a server owner and their first refresh session.
type SetupCommand struct {
	FamilyID, FamilyName, UserID, Username, PasswordHash, DisplayName string
	Role, ChatID, ChatTitle, RefreshTokenID, TokenHash, ExpiresAt     string
	CreatedAt, IPAddress                                              string
}

// SetupStore keeps the multi-row setup transaction outside the identity core.
type SetupStore interface {
	CompleteInitialSetup(context.Context, SetupCommand) error
	CreateAdditionalAdmin(context.Context, SetupCommand) error
}

type SetupService struct{ store SetupStore }

func NewSetupService(store SetupStore) *SetupService { return &SetupService{store: store} }

func (s *SetupService) CompleteInitial(ctx context.Context, command SetupCommand) error {
	return s.store.CompleteInitialSetup(ctx, command)
}

func (s *SetupService) CreateAdmin(ctx context.Context, command SetupCommand) error {
	return s.store.CreateAdditionalAdmin(ctx, command)
}
