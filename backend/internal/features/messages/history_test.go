package messages

import (
	"context"
	"errors"
	"testing"
)

type historyStoreStub struct {
	active bool
	err    error
}

func (s historyStoreStub) ActiveInChat(context.Context, string, string) (bool, error) {
	return s.active, s.err
}
func (historyStoreStub) CreatedAtInChat(context.Context, string, string) (string, error) {
	return "", nil
}
func (historyStoreStub) PageIDs(context.Context, HistoryPage) ([]string, error) { return nil, nil }
func (historyStoreStub) ThreadCounts(context.Context, string, []string) (map[string]int, error) {
	return nil, nil
}

func TestHistoryServiceActiveInChat(t *testing.T) {
	t.Parallel()
	service := NewHistoryService(historyStoreStub{active: true})
	active, err := service.ActiveInChat(context.Background(), "message-1", "chat-1")
	if err != nil || !active {
		t.Fatalf("ActiveInChat() = %v, %v; want true, nil", active, err)
	}
}

func TestHistoryServiceActiveInChatPropagatesError(t *testing.T) {
	t.Parallel()
	want := errors.New("store unavailable")
	service := NewHistoryService(historyStoreStub{err: want})
	_, err := service.ActiveInChat(context.Background(), "message-1", "chat-1")
	if !errors.Is(err, want) {
		t.Fatalf("ActiveInChat() error = %v; want %v", err, want)
	}
}
