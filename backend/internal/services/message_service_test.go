package services

import (
	"context"
	"errors"
	"testing"

	"family-messenger/backend/internal/domain"
)

type messageAuthorizerStub struct {
	canPost bool
	blocked bool
	valid   bool
	err     error
}

func (s messageAuthorizerStub) DirectContactBlocked(context.Context, string, string) (bool, error) {
	return s.blocked, s.err
}
func (s messageAuthorizerStub) CanPost(domain.Chat, domain.Sender) bool { return s.canPost }
func (s messageAuthorizerStub) ReplyBelongsToChat(context.Context, string, string) (bool, error) {
	return s.valid, s.err
}

func TestValidateSendRejectsBlockedDirectMessage(t *testing.T) {
	service := NewMessageService(messageAuthorizerStub{canPost: true, blocked: true})
	err := service.ValidateSend(context.Background(), domain.Chat{Type: "direct", Members: []domain.Member{{ID: "sender"}, {ID: "recipient"}}}, domain.Sender{ID: "sender"}, &domain.SendMessage{})
	if !errors.Is(err, ErrDirectBlocked) {
		t.Fatalf("error = %v, want ErrDirectBlocked", err)
	}
}

func TestValidateSendAllowsChannelCommentAndNormalizesReferences(t *testing.T) {
	root, reply := " root ", " reply "
	input := &domain.SendMessage{ThreadRootMessageID: &root, ReplyToMessageID: &reply}
	service := NewMessageService(messageAuthorizerStub{valid: true})
	err := service.ValidateSend(context.Background(), domain.Chat{ID: "chat", Type: "channel", CommentsEnabled: true}, domain.Sender{ID: "member"}, input)
	if err != nil {
		t.Fatalf("ValidateSend() error = %v", err)
	}
	if input.ReplyToMessageID != nil || input.ThreadRootMessageID == nil || *input.ThreadRootMessageID != "root" {
		t.Fatalf("input = %#v, want normalized comment root only", input)
	}
}

func TestValidateSendRejectsReplyOutsideChat(t *testing.T) {
	reply := "message-in-another-chat"
	service := NewMessageService(messageAuthorizerStub{canPost: true})
	err := service.ValidateSend(context.Background(), domain.Chat{ID: "chat"}, domain.Sender{ID: "sender"}, &domain.SendMessage{ReplyToMessageID: &reply})
	if !errors.Is(err, ErrInvalidReply) {
		t.Fatalf("error = %v, want ErrInvalidReply", err)
	}
}
