package transcription

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
)

type sessionStoreFake struct {
	command     StartSession
	stop        StopSession
	metadata    MetadataUpdate
	summaryID   string
	summary     Summary
	failure     Failure
	recovered   int
	linkedID    string
	linked      bool
	claim       AICallNotesClaim
	claimed     bool
	releasedID  string
	completedID string
	messageID   string
	stopped     bool
	err         error
}

func TestSummaryUsesPersistedCamelCaseSchema(t *testing.T) {
	var summary Summary
	if err := json.Unmarshal([]byte(`{"summary":"note","decisions":[{"text":"yes","sourceSegmentIds":["segment"]}],"actionItems":[{"text":"do","assigneeParticipantId":"user","dueDate":"2026-09-01","sourceSegmentIds":["segment"]}]}`), &summary); err != nil {
		t.Fatal(err)
	}
	if len(summary.Decisions) != 1 || summary.Decisions[0].SourceSegmentIDs[0] != "segment" || summary.ActionItems[0].AssigneeParticipantID == nil || *summary.ActionItems[0].AssigneeParticipantID != "user" {
		t.Fatalf("summary=%+v", summary)
	}
}

func (s *sessionStoreFake) Start(_ context.Context, command StartSession) error {
	s.command = command
	return s.err
}
func (s *sessionStoreFake) UpdateStatus(context.Context, StatusUpdate) error { return s.err }
func (s *sessionStoreFake) UpdateMetadata(_ context.Context, update MetadataUpdate) error {
	s.metadata = update
	return s.err
}
func (s *sessionStoreFake) SaveSummary(_ context.Context, sessionID string, summary Summary) error {
	s.summaryID, s.summary = sessionID, summary
	return s.err
}
func (s *sessionStoreFake) Fail(_ context.Context, failure Failure) error {
	s.failure = failure
	return s.err
}
func (s *sessionStoreFake) RecoverInterrupted(context.Context) (int, error) {
	return s.recovered, s.err
}
func (s *sessionStoreFake) LinkCallHistory(_ context.Context, _, _ string) (string, bool, error) {
	return s.linkedID, s.linked, s.err
}
func (s *sessionStoreFake) ClaimAICallNotes(context.Context, string) (AICallNotesClaim, bool, error) {
	return s.claim, s.claimed, s.err
}
func (s *sessionStoreFake) ReleaseAICallNotesClaim(_ context.Context, sessionID string) error {
	s.releasedID = sessionID
	return s.err
}
func (s *sessionStoreFake) CompleteAICallNotes(_ context.Context, sessionID, messageID string) error {
	s.completedID, s.messageID = sessionID, messageID
	return s.err
}

type chunkStoreFake struct {
	chunk   AudioChunk
	pending int
	err     error
}
type segmentStoreFake struct {
	segment SegmentWrite
	err     error
}

func (s *segmentStoreFake) InsertSegment(_ context.Context, segment SegmentWrite) error {
	s.segment = segment
	return s.err
}

func TestSegmentServiceDelegatesPersistence(t *testing.T) {
	store := &segmentStoreFake{}
	segment := SegmentWrite{ID: "segment", SessionID: "session", ExactText: "hello"}
	if err := NewSegmentService(store).Insert(context.Background(), segment); err != nil {
		t.Fatal(err)
	}
	if store.segment != segment {
		t.Fatalf("stored segment = %+v, want %+v", store.segment, segment)
	}
}

func (s *chunkStoreFake) Chunk(context.Context, string) (AudioChunk, error) { return s.chunk, s.err }
func (s *chunkStoreFake) ReserveChunk(_ context.Context, chunk AudioChunk) (AudioChunk, error) {
	s.chunk = chunk
	return chunk, s.err
}
func (s *chunkStoreFake) CompleteChunk(context.Context, string, int64, string) error { return s.err }
func (s *chunkStoreFake) PendingChunks(context.Context, string) (int, error)         { return s.pending, s.err }
func (s *chunkStoreFake) UploadedChunks(context.Context, string) ([]AudioChunk, error) {
	return []AudioChunk{s.chunk}, s.err
}

func TestChunkServiceDelegatesPersistence(t *testing.T) {
	store := &chunkStoreFake{pending: 2}
	service := NewChunkService(store)
	reserved, err := service.Reserve(context.Background(), AudioChunk{ID: "chunk", SessionID: "session"})
	if err != nil || reserved.ID != "chunk" || store.chunk.SessionID != "session" {
		t.Fatalf("chunk=%+v err=%v", reserved, err)
	}
	if pending, err := service.Pending(context.Background(), "session"); err != nil || pending != 2 {
		t.Fatalf("pending=%d err=%v", pending, err)
	}
}
func (s *sessionStoreFake) Stop(_ context.Context, command StopSession) (string, bool, error) {
	s.stop = command
	return "session", s.stopped, s.err
}

func TestSessionServiceDelegatesStartCommand(t *testing.T) {
	store := &sessionStoreFake{}
	service := NewSessionService(store)
	if err := service.Start(context.Background(), StartSession{SessionID: "session", CallID: "call"}); err != nil || store.command.CallID != "call" {
		t.Fatalf("command=%+v err=%v", store.command, err)
	}
	store.err = errors.New("conflict")
	if err := service.Start(context.Background(), StartSession{}); !errors.Is(err, store.err) {
		t.Fatalf("err=%v", err)
	}
	store.err, store.stopped = nil, true
	if id, stopped, err := service.Stop(context.Background(), StopSession{CallID: "call"}); err != nil || !stopped || id != "session" || store.stop.CallID != "call" {
		t.Fatalf("id=%q stopped=%v command=%+v err=%v", id, stopped, store.stop, err)
	}
}

func TestSessionServiceDelegatesWorkerLifecycle(t *testing.T) {
	store := &sessionStoreFake{
		recovered: 3,
		linkedID:  "session",
		linked:    true,
		claim:     AICallNotesClaim{SessionID: "session", Summary: Summary{Summary: "notes"}},
		claimed:   true,
	}
	service := NewSessionService(store)
	metadata := MetadataUpdate{SessionID: "session", SubmittedAudioMs: 42, DetectedLanguages: []string{"en"}}
	if err := service.UpdateMetadata(context.Background(), metadata); err != nil || store.metadata.SubmittedAudioMs != 42 {
		t.Fatalf("metadata=%+v err=%v", store.metadata, err)
	}
	if err := service.SaveSummary(context.Background(), "session", Summary{Summary: "notes"}); err != nil || store.summaryID != "session" || store.summary.Summary != "notes" {
		t.Fatalf("summary=%+v id=%q err=%v", store.summary, store.summaryID, err)
	}
	if err := service.Fail(context.Background(), Failure{SessionID: "session", Code: "failed"}); err != nil || store.failure.Code != "failed" {
		t.Fatalf("failure=%+v err=%v", store.failure, err)
	}
	if count, err := service.RecoverInterrupted(context.Background()); err != nil || count != 3 {
		t.Fatalf("count=%d err=%v", count, err)
	}
	if id, linked, err := service.LinkCallHistory(context.Background(), "call", "history"); err != nil || !linked || id != "session" {
		t.Fatalf("id=%q linked=%v err=%v", id, linked, err)
	}
	if claim, claimed, err := service.ClaimAICallNotes(context.Background(), "session"); err != nil || !claimed || claim.Summary.Summary != "notes" {
		t.Fatalf("claim=%+v claimed=%v err=%v", claim, claimed, err)
	}
	if err := service.ReleaseAICallNotesClaim(context.Background(), "session"); err != nil || store.releasedID != "session" {
		t.Fatalf("released=%q err=%v", store.releasedID, err)
	}
	if err := service.CompleteAICallNotes(context.Background(), "session", "message"); err != nil || store.completedID != "session" || store.messageID != "message" {
		t.Fatalf("completed=%q message=%q err=%v", store.completedID, store.messageID, err)
	}
}
