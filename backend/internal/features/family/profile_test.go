package family

import (
	"context"
	"errors"
	"testing"
)

type profileStoreFake struct {
	familyID string
	patch    ProfilePatch
	err      error
}

func (s *profileStoreFake) UpdateProfile(_ context.Context, familyID string, patch ProfilePatch) error {
	s.familyID, s.patch = familyID, patch
	return s.err
}

func TestProfileServiceDelegatesPatch(t *testing.T) {
	name := "New name"
	store := &profileStoreFake{}
	if err := NewProfileService(store).Update(context.Background(), "family", ProfilePatch{Name: &name, UpdatedAt: "now"}); err != nil {
		t.Fatal(err)
	}
	if store.familyID != "family" || store.patch.Name == nil || *store.patch.Name != name {
		t.Fatalf("store=%+v", store)
	}
	store.err = errors.New("update failed")
	if err := NewProfileService(store).Update(context.Background(), "family", ProfilePatch{}); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
