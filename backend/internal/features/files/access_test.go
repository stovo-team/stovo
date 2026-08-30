package files

import (
	"context"
	"errors"
	"testing"
)

type accessStoreFake struct {
	visibility string
	member     bool
	err        error
}

func (f accessStoreFake) LoadAccessRecord(context.Context, string, string) (AccessRecord, error) {
	return AccessRecord{}, f.err
}
func (f accessStoreFake) ChatMediaVisibility(context.Context, string) (string, error) {
	return f.visibility, f.err
}
func (f accessStoreFake) IsChatMember(context.Context, string, string) (bool, error) {
	return f.member, f.err
}

func TestAccessServiceVisibleTo(t *testing.T) {
	chatID := "chat"
	record := AccessRecord{FamilyID: "family", ChatID: &chatID}
	if !NewAccessService(accessStoreFake{visibility: "family"}).VisibleTo(context.Background(), record, "family", "user") {
		t.Fatal("family-visible chat file should be visible")
	}
	if !NewAccessService(accessStoreFake{visibility: "members", member: true}).VisibleTo(context.Background(), record, "family", "user") {
		t.Fatal("member should see member-visible chat file")
	}
	if NewAccessService(accessStoreFake{visibility: "members"}).VisibleTo(context.Background(), record, "family", "user") {
		t.Fatal("non-member should not see member-visible chat file")
	}
	if NewAccessService(accessStoreFake{err: errors.New("down")}).VisibleTo(context.Background(), record, "family", "user") {
		t.Fatal("store failure must deny access")
	}
}
