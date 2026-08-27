package messages

import (
	"context"
	"errors"
	"testing"

	"family-messenger/backend/internal/domain"
)

type authorizerStub struct {
	canPost bool
	blocked bool
	valid   bool
}

func (s authorizerStub) DirectContactBlocked(context.Context, string, string) (bool, error) {
	return s.blocked, nil
}

func (s authorizerStub) CanPost(domain.Chat, domain.Sender) bool { return s.canPost }

func (s authorizerStub) ReplyBelongsToChat(context.Context, string, string) (bool, error) {
	return s.valid, nil
}

func TestServiceRejectsBlockedDirectMessage(t *testing.T) {
	service := NewService(authorizerStub{canPost: true, blocked: true})
	err := service.ValidateSend(context.Background(), domain.Chat{
		Type:    "direct",
		Members: []domain.Member{{ID: "sender"}, {ID: "recipient"}},
	}, domain.Sender{ID: "sender"}, &domain.SendMessage{})
	if !errors.Is(err, ErrDirectBlocked) {
		t.Fatalf("ValidateSend() error = %v, want ErrDirectBlocked", err)
	}
}
