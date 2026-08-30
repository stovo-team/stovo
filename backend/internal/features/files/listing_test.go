package files

import (
	"context"
	"errors"
	"testing"
)

type listingStoreFake struct {
	ids []string
	err error
}

func (s *listingStoreFake) VisibleFamilyFileIDs(context.Context, string) ([]string, error) {
	return s.ids, s.err
}

func (s *listingStoreFake) ChatFileIDs(context.Context, string, string, int) ([]string, error) {
	return s.ids, s.err
}

func TestListingServiceDelegatesVisibleFamilyQuery(t *testing.T) {
	store := &listingStoreFake{ids: []string{"file-1"}}
	service := NewListingService(store)
	ids, err := service.VisibleFamilyFileIDs(context.Background(), "family")
	if err != nil || len(ids) != 1 || ids[0] != "file-1" {
		t.Fatalf("ids=%v err=%v", ids, err)
	}
	store.err = errors.New("read failed")
	if _, err := service.VisibleFamilyFileIDs(context.Background(), "family"); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
}

func TestListingServiceDelegatesChatFileQuery(t *testing.T) {
	store := &listingStoreFake{ids: []string{"file-1"}}
	service := NewListingService(store)
	ids, err := service.ChatFileIDs(context.Background(), "family", "chat", 10)
	if err != nil || len(ids) != 1 || ids[0] != "file-1" {
		t.Fatalf("ids=%v err=%v", ids, err)
	}
}
