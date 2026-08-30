package sync

import (
	"context"
	"errors"
	"testing"
)

type storeFake struct {
	events    []Event
	highWater int64
	listAfter int64
	listLimit int
}

func (s *storeFake) List(_ context.Context, _ Actor, after int64, limit int) ([]Event, error) {
	s.listAfter, s.listLimit = after, limit
	return append([]Event(nil), s.events...), nil
}
func (s *storeFake) HighWater(context.Context, string) (int64, error) { return s.highWater, nil }

func TestPageSignsCursorAndAppliesLimit(t *testing.T) {
	store := &storeFake{events: []Event{{Sequence: 10}, {Sequence: 11}, {Sequence: 12}}}
	service := NewService(store, "secret")
	actor := Actor{FamilyID: "family", UserID: "user"}
	page, err := service.Page(context.Background(), actor, "", "2")
	if err != nil {
		t.Fatalf("page: %v", err)
	}
	if len(page.Events) != 2 || !page.HasMore || page.NextCursor == "" || store.listAfter != 0 || store.listLimit != 3 {
		t.Fatalf("page=%+v after=%d limit=%d", page, store.listAfter, store.listLimit)
	}
	next, err := service.Page(context.Background(), actor, page.NextCursor, "2")
	if err != nil {
		t.Fatalf("next page: %v", err)
	}
	if store.listAfter != 11 || len(next.Events) != 2 {
		t.Fatalf("after=%d events=%d", store.listAfter, len(next.Events))
	}
}

func TestPageRejectsForeignOrMalformedCursor(t *testing.T) {
	service := NewService(&storeFake{}, "secret")
	cursorPage, err := service.Page(context.Background(), Actor{FamilyID: "family-a", UserID: "user"}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	_, err = service.Page(context.Background(), Actor{FamilyID: "family-b", UserID: "user"}, cursorPage.NextCursor, "")
	if !errors.Is(err, ErrInvalidCursor) {
		t.Fatalf("err=%v", err)
	}
	_, err = service.Page(context.Background(), Actor{FamilyID: "family-a", UserID: "user"}, "", "501")
	if !errors.Is(err, ErrInvalidLimit) {
		t.Fatalf("err=%v", err)
	}
}
