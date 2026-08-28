package services

import (
	"context"
	"errors"
	"testing"

	"stovo-messenger/backend/internal/domain"
)

type callChatStub struct {
	chat domain.CallChat
	err  error
}

func (s callChatStub) CallChat(context.Context, string) (domain.CallChat, error) {
	return s.chat, s.err
}

type privacyStub struct {
	blocked bool
	err     error
}

func (s privacyStub) DirectCallBlocked(context.Context, string, string) (bool, error) {
	return s.blocked, s.err
}

type activeStub map[string]string

func (s activeStub) ActiveCallChat(_ context.Context, userID string) (string, bool, error) {
	chatID, ok := s[userID]
	return chatID, ok, nil
}

func TestPrepareStartBuildsConnectedGroupCall(t *testing.T) {
	service := NewCallService(callChatStub{chat: domain.CallChat{ID: "chat", Type: domain.ChatTypeGroup, Members: []string{"caller", "one", "two"}}}, nil, nil)
	call, err := service.PrepareStart(context.Background(), StartCallInput{ChatID: "chat", CallerUserID: "caller", CallType: "video"})
	if err != nil {
		t.Fatalf("PrepareStart: %v", err)
	}
	if !call.StartsActive || call.CallType != domain.CallTypeVideo || len(call.Participants) != 3 {
		t.Fatalf("unexpected call: %#v", call)
	}
}

func TestPrepareStartAllowsEmptyVoiceChannel(t *testing.T) {
	service := NewCallService(callChatStub{chat: domain.CallChat{ID: "voice", Type: domain.ChatTypeVoice, Members: []string{"caller"}}}, nil, nil)
	call, err := service.PrepareStart(context.Background(), StartCallInput{ChatID: "voice", CallerUserID: "caller"})
	if err != nil {
		t.Fatalf("PrepareStart: %v", err)
	}
	if len(call.InviteeIDs()) != 0 || call.CallType != domain.CallTypeAudio {
		t.Fatalf("unexpected call: %#v", call)
	}
}

func TestPrepareStartRejectsBlockedDirectCall(t *testing.T) {
	service := NewCallService(callChatStub{chat: domain.CallChat{ID: "direct", Type: domain.ChatTypeDirect, Members: []string{"caller", "callee"}}}, privacyStub{blocked: true}, nil)
	_, err := service.PrepareStart(context.Background(), StartCallInput{ChatID: "direct", CallerUserID: "caller"})
	if err == nil || err.Error() != "calls are unavailable for this member" {
		t.Fatalf("expected privacy failure, got %v", err)
	}
}

func TestPrepareStartRejectsBusyInvitee(t *testing.T) {
	service := NewCallService(callChatStub{chat: domain.CallChat{ID: "chat", Type: domain.ChatTypeGroup, Members: []string{"caller", "busy"}}}, nil, activeStub{"busy": "other"})
	_, err := service.PrepareStart(context.Background(), StartCallInput{ChatID: "chat", CallerUserID: "caller"})
	if err == nil || err.Error() != "participant is busy in another call" {
		t.Fatalf("expected busy failure, got %v", err)
	}
}

func TestPrepareStartRejectsUnsupportedChat(t *testing.T) {
	service := NewCallService(callChatStub{chat: domain.CallChat{ID: "channel", Type: domain.ChatTypeChannel, Members: []string{"caller"}}}, nil, nil)
	_, err := service.PrepareStart(context.Background(), StartCallInput{ChatID: "channel", CallerUserID: "caller"})
	if !errors.Is(err, ErrCallsUnavailable) {
		t.Fatalf("expected unavailable error, got %v", err)
	}
}
