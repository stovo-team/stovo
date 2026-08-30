package chats

import (
	"context"
	"errors"
	"testing"
)

type queryStoreFake struct {
	get       ChatDetails
	list      []ChatDetails
	typeValue string
	err       error
}

func (f queryStoreFake) GetForMember(context.Context, string, string) (ChatDetails, error) {
	return f.get, f.err
}
func (f queryStoreFake) ListForUser(context.Context, string) ([]ChatDetails, error) {
	return f.list, f.err
}
func (f queryStoreFake) Type(context.Context, string) (string, error) { return f.typeValue, f.err }

func TestQueryServiceDelegates(t *testing.T) {
	want := ChatDetails{ID: "chat-1"}
	svc := NewQueryService(queryStoreFake{get: want, list: []ChatDetails{want}})
	got, err := svc.GetForMember(context.Background(), "chat-1", "user-1")
	if err != nil || got.ID != want.ID {
		t.Fatalf("GetForMember() = %#v, %v", got, err)
	}
	rows, err := svc.ListForUser(context.Background(), "user-1")
	if err != nil || len(rows) != 1 || rows[0].ID != want.ID {
		t.Fatalf("ListForUser() = %#v, %v", rows, err)
	}
}

func TestQueryServicePropagatesError(t *testing.T) {
	want := errors.New("store unavailable")
	_, err := NewQueryService(queryStoreFake{err: want}).GetForMember(context.Background(), "chat-1", "user-1")
	if !errors.Is(err, want) {
		t.Fatalf("GetForMember() error = %v, want %v", err, want)
	}
}

func TestQueryServiceDelegatesType(t *testing.T) {
	typeValue, err := NewQueryService(queryStoreFake{typeValue: "group"}).Type(context.Background(), "chat-1")
	if err != nil || typeValue != "group" {
		t.Fatalf("Type() = %q, %v", typeValue, err)
	}
}
