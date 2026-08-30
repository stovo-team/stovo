// Package privacy contains account privacy use cases.
package privacy

import (
	"context"
	"errors"
	"time"
)

var ErrInvalidMember = errors.New("invalid family member")

// Store is the feature-owned persistence boundary for privacy blocks.
type Store interface {
	ListBlockedUserIDs(context.Context, string) ([]string, error)
	BlockUser(context.Context, string, string, string) error
	UnblockUser(context.Context, string, string) error
}

// Member is the authorization data required to block another family member.
type Member struct {
	ID       string
	FamilyID string
	Active   bool
}

type Clock func() time.Time

type Service struct {
	store Store
	now   Clock
}

func NewService(store Store, now Clock) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{store: store, now: now}
}

func (s *Service) ListBlocked(ctx context.Context, userID string) ([]string, error) {
	return s.store.ListBlockedUserIDs(ctx, userID)
}

func (s *Service) Block(ctx context.Context, actor, target Member) error {
	if target.ID == "" || target.ID == actor.ID || target.FamilyID != actor.FamilyID || !target.Active {
		return ErrInvalidMember
	}
	return s.store.BlockUser(ctx, actor.ID, target.ID, s.now().UTC().Format(time.RFC3339Nano))
}

func (s *Service) Unblock(ctx context.Context, actorID, targetID string) error {
	return s.store.UnblockUser(ctx, actorID, targetID)
}
