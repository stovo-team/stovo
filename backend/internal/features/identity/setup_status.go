package identity

import "context"

// SetupStatus is the persistence-neutral installation state consumed by the
// HTTP setup transport.
type SetupStatus struct {
	ActiveUserCount int
	FamilyName      *string
}

// SetupStatusStore is owned by the identity feature because setup status is a
// prerequisite for its setup commands.
type SetupStatusStore interface {
	LoadSetupStatus(context.Context) (SetupStatus, error)
}

type SetupStatusService struct{ store SetupStatusStore }

func NewSetupStatusService(store SetupStatusStore) *SetupStatusService {
	return &SetupStatusService{store: store}
}

func (s *SetupStatusService) Load(ctx context.Context) (SetupStatus, error) {
	return s.store.LoadSetupStatus(ctx)
}
