package mcp

import (
	"context"
	"errors"
	"testing"
)

func TestListChatsCallbackPreservesSummaries(t *testing.T) {
	list := ListChats(func(context.Context) ([]ChatSummary, error) {
		return []ChatSummary{{ID: "chat-1", Type: "group", Title: "Family"}}, nil
	})
	chats, err := list(context.Background())
	if err != nil || len(chats) != 1 || chats[0].Title != "Family" {
		t.Fatalf("list result = %#v, %v", chats, err)
	}
}

func TestListChatsErrorIsAvailableToTransport(t *testing.T) {
	list := ListChats(func(context.Context) ([]ChatSummary, error) { return nil, errors.New("denied") })
	if _, err := list(context.Background()); err == nil || err.Error() != "denied" {
		t.Fatalf("error = %v", err)
	}
}
