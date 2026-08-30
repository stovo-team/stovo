package files

import (
	"context"
	"errors"
	"testing"
)

type cloneStoreFake struct {
	clones  []CloneMetadata
	deleted string
	err     error
}

func (s *cloneStoreFake) CreateClones(_ context.Context, clones []CloneMetadata) error {
	s.clones = append([]CloneMetadata(nil), clones...)
	return s.err
}
func (s *cloneStoreFake) DeleteClone(_ context.Context, id string) error {
	s.deleted = id
	return s.err
}

func TestCloneServiceDelegatesAtomicMetadataAndCleanup(t *testing.T) {
	store := &cloneStoreFake{}
	service := NewCloneService(store)
	clones := []CloneMetadata{{ID: "file-1", ObjectKey: "family/chat/file"}}
	if err := service.Create(context.Background(), clones); err != nil || len(store.clones) != 1 || store.clones[0].ID != "file-1" {
		t.Fatalf("clones=%+v err=%v", store.clones, err)
	}
	if err := service.Delete(context.Background(), "file-1"); err != nil || store.deleted != "file-1" {
		t.Fatalf("deleted=%q err=%v", store.deleted, err)
	}
	store.err = errors.New("persistence failed")
	if err := service.Create(context.Background(), clones); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}
