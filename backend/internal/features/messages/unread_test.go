package messages

import (
	"context"
	"errors"
	"testing"
)

type unreadStoreFake struct {
	count int
	err   error
}

func (f unreadStoreFake) UnreadCount(context.Context, string, string) (int, error) {
	return f.count, f.err
}

func TestUnreadServiceDelegatesAndPropagatesErrors(t *testing.T) {
	count, err := NewUnreadService(unreadStoreFake{count: 3}).Count(context.Background(), "chat", "user")
	if err != nil || count != 3 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	want := errors.New("store unavailable")
	_, err = NewUnreadService(unreadStoreFake{err: want}).Count(context.Background(), "chat", "user")
	if !errors.Is(err, want) {
		t.Fatalf("err=%v", err)
	}
}
