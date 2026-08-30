package privacy

import (
	"context"
	"errors"
	"testing"
	"time"
)

type storeFake struct {
	blockedWith [3]string
	blocked     []string
}

func (f *storeFake) ListBlockedUserIDs(context.Context, string) ([]string, error) {
	return f.blocked, nil
}
func (f *storeFake) BlockUser(_ context.Context, actorID, targetID, createdAt string) error {
	f.blockedWith = [3]string{actorID, targetID, createdAt}
	return nil
}
func (f *storeFake) UnblockUser(context.Context, string, string) error { return nil }

func TestBlockRejectsInvalidTargets(t *testing.T) {
	service := NewService(&storeFake{}, func() time.Time { return time.Unix(0, 0) })
	actor := Member{ID: "actor", FamilyID: "family", Active: true}
	for _, target := range []Member{{}, {ID: "actor", FamilyID: "family", Active: true}, {ID: "other", FamilyID: "other", Active: true}, {ID: "other", FamilyID: "family"}} {
		if err := service.Block(context.Background(), actor, target); !errors.Is(err, ErrInvalidMember) {
			t.Fatalf("target %#v: err = %v", target, err)
		}
	}
}

func TestBlockPersistsValidFamilyMember(t *testing.T) {
	store := &storeFake{}
	service := NewService(store, func() time.Time { return time.Date(2026, 8, 28, 12, 0, 0, 0, time.UTC) })
	err := service.Block(context.Background(), Member{ID: "actor", FamilyID: "family", Active: true}, Member{ID: "target", FamilyID: "family", Active: true})
	if err != nil {
		t.Fatalf("block member: %v", err)
	}
	if store.blockedWith[0] != "actor" || store.blockedWith[1] != "target" || store.blockedWith[2] != "2026-08-28T12:00:00Z" {
		t.Fatalf("block parameters = %#v", store.blockedWith)
	}
}
