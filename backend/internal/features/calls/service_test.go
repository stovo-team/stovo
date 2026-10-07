package calls

import (
	"context"
	"testing"
	"time"

	"stovo-messenger/backend/internal/domain"
)

type sessionStoreStub struct{ created Session }

func (s *sessionStoreStub) CreateSession(_ context.Context, session Session) error {
	s.created = session
	return nil
}
func (*sessionStoreStub) UpdateSessionState(context.Context, string, string) error    { return nil }
func (*sessionStoreStub) UpdateSessionTopology(context.Context, string, string) error { return nil }
func (*sessionStoreStub) EndSession(context.Context, string, int, time.Time) error    { return nil }
func (*sessionStoreStub) UpsertParticipant(context.Context, Participant) error        { return nil }
func (*sessionStoreStub) ActiveSessions(context.Context, time.Duration) ([]Session, error) {
	return nil, nil
}
func (*sessionStoreStub) Participants(context.Context, string) ([]Participant, error) {
	return nil, nil
}
func (*sessionStoreStub) RecordHistory(context.Context, HistoryRecord) error { return nil }

func TestPersistenceServiceUsesFeatureSessionValue(t *testing.T) {
	store := &sessionStoreStub{}
	service := NewPersistenceService(store)
	session := Session{ID: "room", ChatID: "chat", State: "ringing"}
	if err := service.Create(context.Background(), session); err != nil {
		t.Fatal(err)
	}
	if store.created != session {
		t.Fatalf("created=%+v", store.created)
	}
}

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

func TestServiceAllowsStartingGroupCallWithOnlyCaller(t *testing.T) {
	service := NewService(chatReaderStub{chat: domain.CallChat{
		ID: "chat", Type: domain.ChatTypeGroup, Members: []string{"caller"},
	}}, nil, nil)

	call, err := service.PrepareStart(context.Background(), StartInput{ChatID: "chat", CallerUserID: "caller", CallType: "audio"})
	if err != nil {
		t.Fatalf("PrepareStart() error = %v", err)
	}
	if !call.StartsActive || len(call.Participants) != 1 || call.Participants[0].UserID != "caller" {
		t.Fatalf("PrepareStart() = %#v, want an active call with only the caller", call)
	}
}
