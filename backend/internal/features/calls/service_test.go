package calls

import (
	"context"
	"testing"

	"family-messenger/backend/internal/domain"
)

type chatReaderStub struct{ chat domain.CallChat }

func (s chatReaderStub) CallChat(context.Context, string) (domain.CallChat, error) {
	return s.chat, nil
}

func TestServiceBuildsConnectedGroupCall(t *testing.T) {
	service := NewService(chatReaderStub{chat: domain.CallChat{
		ID: "chat", Type: domain.ChatTypeGroup, Members: []string{"caller", "member"},
	}}, nil, nil)
	call, err := service.PrepareStart(context.Background(), StartInput{ChatID: "chat", CallerUserID: "caller", CallType: "video"})
	if err != nil {
		t.Fatalf("PrepareStart() error = %v", err)
	}
	if !call.StartsActive || call.CallType != domain.CallTypeVideo || len(call.Participants) != 2 {
		t.Fatalf("PrepareStart() = %#v, want connected group call", call)
	}
}
