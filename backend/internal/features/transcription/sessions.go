// Package transcription owns transcription-session lifecycle commands. Audio
// provider SDKs, storage, and SQL remain outside this application core.
package transcription

import (
	"context"
	"time"
)

type StartSession struct {
	SessionID, ChatID, CallID, InitiatedBy, Provider, ProviderModel string
	StartedAt                                                       time.Time
}

type StopSession struct {
	CallID, RequestedSessionID string
	StoppedAt                  time.Time
}
type StatusUpdate struct {
	SessionID, Status      string
	StoppedAt, CompletedAt *time.Time
}
type MetadataUpdate struct {
	SessionID         string
	SubmittedAudioMs  int64
	EstimatedCostUSD  float64
	DetectedLanguages []string
}
type Failure struct{ SessionID, Code, Message string }
type AICallNotesClaim struct {
	SessionID, InitiatedBy, ChatID, CallHistoryMessageID string
	Summary                                              Summary
}

type SessionStore interface {
	Start(context.Context, StartSession) error
	Stop(context.Context, StopSession) (string, bool, error)
	UpdateStatus(context.Context, StatusUpdate) error
	UpdateMetadata(context.Context, MetadataUpdate) error
	SaveSummary(context.Context, string, Summary) error
	Fail(context.Context, Failure) error
	RecoverInterrupted(context.Context) (int, error)
	LinkCallHistory(context.Context, string, string) (string, bool, error)
	ClaimAICallNotes(context.Context, string) (AICallNotesClaim, bool, error)
	ReleaseAICallNotesClaim(context.Context, string) error
	CompleteAICallNotes(context.Context, string, string) error
}

type SessionService struct{ store SessionStore }

func NewSessionService(store SessionStore) *SessionService { return &SessionService{store: store} }
func (s *SessionService) Start(ctx context.Context, command StartSession) error {
	return s.store.Start(ctx, command)
}
func (s *SessionService) Stop(ctx context.Context, command StopSession) (string, bool, error) {
	return s.store.Stop(ctx, command)
}
func (s *SessionService) UpdateStatus(ctx context.Context, update StatusUpdate) error {
	return s.store.UpdateStatus(ctx, update)
}
func (s *SessionService) UpdateMetadata(ctx context.Context, update MetadataUpdate) error {
	return s.store.UpdateMetadata(ctx, update)
}
func (s *SessionService) SaveSummary(ctx context.Context, sessionID string, summary Summary) error {
	return s.store.SaveSummary(ctx, sessionID, summary)
}
// SaveExactArtifact records the object-store key for the authoritative exact
// transcript artifact when the backing store supports artifact metadata.
func (s *SessionService) SaveExactArtifact(ctx context.Context, sessionID, objectKey string) error {
	store, ok := s.store.(interface {
		SaveExactArtifact(context.Context, string, string) error
	})
	if !ok {
		return nil
	}
	return store.SaveExactArtifact(ctx, sessionID, objectKey)
}
func (s *SessionService) Fail(ctx context.Context, failure Failure) error {
	return s.store.Fail(ctx, failure)
}
func (s *SessionService) RecoverInterrupted(ctx context.Context) (int, error) {
	return s.store.RecoverInterrupted(ctx)
}
func (s *SessionService) LinkCallHistory(ctx context.Context, callID, messageID string) (string, bool, error) {
	return s.store.LinkCallHistory(ctx, callID, messageID)
}
func (s *SessionService) ClaimAICallNotes(ctx context.Context, sessionID string) (AICallNotesClaim, bool, error) {
	return s.store.ClaimAICallNotes(ctx, sessionID)
}
func (s *SessionService) ReleaseAICallNotesClaim(ctx context.Context, sessionID string) error {
	return s.store.ReleaseAICallNotesClaim(ctx, sessionID)
}
func (s *SessionService) CompleteAICallNotes(ctx context.Context, sessionID, messageID string) error {
	return s.store.CompleteAICallNotes(ctx, sessionID, messageID)
}

type AudioChunk struct {
	ID, SessionID, ParticipantID, ObjectKey, Container, Codec string
	Sequence                                                  int
	CallStartMs, CallEndMs, DurationMs                        int64
	ClientVADScore                                            float64
}

type ChunkStore interface {
	Chunk(context.Context, string) (AudioChunk, error)
	ReserveChunk(context.Context, AudioChunk) (AudioChunk, error)
	CompleteChunk(context.Context, string, int64, string) error
	PendingChunks(context.Context, string) (int, error)
	UploadedChunks(context.Context, string) ([]AudioChunk, error)
}

type ChunkService struct{ store ChunkStore }

func NewChunkService(store ChunkStore) *ChunkService { return &ChunkService{store: store} }
func (s *ChunkService) Get(ctx context.Context, chunkID string) (AudioChunk, error) {
	return s.store.Chunk(ctx, chunkID)
}
func (s *ChunkService) Reserve(ctx context.Context, chunk AudioChunk) (AudioChunk, error) {
	return s.store.ReserveChunk(ctx, chunk)
}
func (s *ChunkService) Complete(ctx context.Context, chunkID string, sizeBytes int64, checksum string) error {
	return s.store.CompleteChunk(ctx, chunkID, sizeBytes, checksum)
}
func (s *ChunkService) Pending(ctx context.Context, sessionID string) (int, error) {
	return s.store.PendingChunks(ctx, sessionID)
}
func (s *ChunkService) Uploaded(ctx context.Context, sessionID string) ([]AudioChunk, error) {
	return s.store.UploadedChunks(ctx, sessionID)
}

type SessionView struct {
	ID, CallID, InitiatedBy, Provider, ProviderModel string
	Status                                           string
	StartedAt, StoppedAt, CompletedAt                *time.Time
	SubmittedAudioMs                                 int64
	EstimatedCostUSD                                 *float64
	FailureCode, FailureMessage                      *string
	CreatedAt                                        time.Time
}
type Segment struct {
	ID, CallID, SessionID, ParticipantID, ExactText string
	ParticipantName                                 string
	StartMs, EndMs                                  int64
	CleanedText, DetectedLanguage                   *string
	Confidence                                      *float64
}
type SegmentWrite struct {
	ID, CallID, SessionID, ParticipantID, ExactText, Language string
	StartMs, EndMs                                            int64
	Confidence                                                float64
	ProviderIndex                                             int
}
type SegmentStore interface {
	InsertSegment(context.Context, SegmentWrite) error
}
type SegmentService struct{ store SegmentStore }

func NewSegmentService(store SegmentStore) *SegmentService { return &SegmentService{store: store} }
func (s *SegmentService) Insert(ctx context.Context, segment SegmentWrite) error {
	return s.store.InsertSegment(ctx, segment)
}

type Decision struct {
	Text             string   `json:"text"`
	SourceSegmentIDs []string `json:"sourceSegmentIds"`
}
type ActionItem struct {
	Text                  string   `json:"text"`
	AssigneeParticipantID *string  `json:"assigneeParticipantId"`
	DueDate               *string  `json:"dueDate"`
	SourceSegmentIDs      []string `json:"sourceSegmentIds"`
}
type OpenQuestion struct {
	Text             string   `json:"text"`
	SourceSegmentIDs []string `json:"sourceSegmentIds"`
}
type Summary struct {
	Summary       string         `json:"summary"`
	Decisions     []Decision     `json:"decisions"`
	ActionItems   []ActionItem   `json:"actionItems"`
	OpenQuestions []OpenQuestion `json:"openQuestions"`
}
type Transcript struct {
	Session  SessionView
	Segments []Segment
	Summary  *Summary
}
type Artifact struct{ ObjectKey, ContentType string }

type QueryStore interface {
	LatestSession(context.Context, string) (SessionView, error)
	Transcript(context.Context, string) (Transcript, error)
	Artifact(context.Context, string, string) (Artifact, error)
	UpdateCleanedText(context.Context, string, string) error
}
type QueryService struct{ store QueryStore }

func NewQueryService(store QueryStore) *QueryService { return &QueryService{store: store} }
func (s *QueryService) Latest(ctx context.Context, callID string) (SessionView, error) {
	return s.store.LatestSession(ctx, callID)
}
func (s *QueryService) Transcript(ctx context.Context, callID string) (Transcript, error) {
	return s.store.Transcript(ctx, callID)
}
func (s *QueryService) Artifact(ctx context.Context, callID, artifactType string) (Artifact, error) {
	return s.store.Artifact(ctx, callID, artifactType)
}
func (s *QueryService) UpdateCleanedText(ctx context.Context, segmentID, cleanedText string) error {
	return s.store.UpdateCleanedText(ctx, segmentID, cleanedText)
}
