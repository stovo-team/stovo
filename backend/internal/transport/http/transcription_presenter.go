package http

import (
	"time"

	featuretranscription "stovo-messenger/backend/internal/features/transcription"
	"stovo-messenger/backend/internal/transcription"
)

// TranscriptionSessionResponse and related DTOs are the stable REST shape for
// AI Notes. They belong to the HTTP driving adapter, not the application host.
type TranscriptionSessionResponse struct {
	ID                string                      `json:"id"`
	CallID            string                      `json:"callId"`
	InitiatedBy       string                      `json:"initiatedBy"`
	Status            transcription.SessionStatus `json:"status"`
	Provider          string                      `json:"provider"`
	ProviderModel     string                      `json:"providerModel"`
	StartedAt         *time.Time                  `json:"startedAt"`
	StoppedAt         *time.Time                  `json:"stoppedAt"`
	CompletedAt       *time.Time                  `json:"completedAt"`
	SubmittedAudioMs  int64                       `json:"submittedAudioMs"`
	EstimatedCostUSD  *float64                    `json:"estimatedCostUsd"`
	DetectedLanguages []string                    `json:"detectedLanguages"`
	FailureCode       *string                     `json:"failureCode"`
	FailureMessage    *string                     `json:"failureMessage"`
	CreatedAt         time.Time                   `json:"createdAt"`
}
type TranscriptSegmentResponse struct {
	ID               string   `json:"id"`
	CallID           string   `json:"callId"`
	SessionID        string   `json:"sessionId"`
	ParticipantID    string   `json:"participantId"`
	ParticipantName  string   `json:"participantName"`
	StartMs          int64    `json:"startMs"`
	EndMs            int64    `json:"endMs"`
	ExactText        string   `json:"exactText"`
	CleanedText      *string  `json:"cleanedText"`
	DetectedLanguage *string  `json:"detectedLanguage"`
	Confidence       *float64 `json:"confidence"`
}
type TranscriptSummaryResponse struct {
	Summary       string                       `json:"summary"`
	Decisions     []transcription.DecisionItem `json:"decisions"`
	ActionItems   []transcription.ActionItem   `json:"actionItems"`
	OpenQuestions []transcription.OpenQuestion `json:"openQuestions"`
}
type TranscriptResponse struct {
	Session  TranscriptionSessionResponse `json:"session"`
	Segments []TranscriptSegmentResponse  `json:"segments"`
	Summary  *TranscriptSummaryResponse   `json:"summary"`
}
type UploadAudioChunkRequest struct {
	SessionID     string `json:"sessionId"`
	ParticipantID string `json:"participantId"`
	Sequence      int    `json:"sequence"`
	Container     string `json:"container"`
	CallStartMs   int64  `json:"callStartMs"`
	CallEndMs     int64  `json:"callEndMs"`
	DurationMs    int64  `json:"durationMs"`
	ClientVADScore float64 `json:"clientVadScore"`
}
type UploadAudioChunkResponse struct {
	ChunkID   string `json:"chunkId"`
	UploadURL string `json:"uploadUrl"`
	ObjectKey string `json:"objectKey"`
	ExpiresAt string `json:"expiresAt"`
}
type CompleteAudioUploadRequest struct {
	Checksum  string `json:"checksum"`
	SizeBytes int64  `json:"sizeBytes"`
}

func TranscriptionSessionFromFeature(session featuretranscription.SessionView) TranscriptionSessionResponse {
	return TranscriptionSessionResponse{ID: session.ID, CallID: session.CallID, InitiatedBy: session.InitiatedBy, Status: transcription.SessionStatus(session.Status), Provider: session.Provider, ProviderModel: session.ProviderModel, StartedAt: session.StartedAt, StoppedAt: session.StoppedAt, CompletedAt: session.CompletedAt, SubmittedAudioMs: session.SubmittedAudioMs, EstimatedCostUSD: session.EstimatedCostUSD, DetectedLanguages: []string{}, FailureCode: session.FailureCode, FailureMessage: session.FailureMessage, CreatedAt: session.CreatedAt}
}
func TranscriptFromFeature(value featuretranscription.Transcript) TranscriptResponse {
	result := TranscriptResponse{Session: TranscriptionSessionFromFeature(value.Session), Segments: make([]TranscriptSegmentResponse, 0, len(value.Segments))}
	for _, segment := range value.Segments {
		result.Segments = append(result.Segments, TranscriptSegmentResponse{ID: segment.ID, CallID: segment.CallID, SessionID: segment.SessionID, ParticipantID: segment.ParticipantID, ParticipantName: segment.ParticipantName, StartMs: segment.StartMs, EndMs: segment.EndMs, ExactText: segment.ExactText, CleanedText: segment.CleanedText, DetectedLanguage: segment.DetectedLanguage, Confidence: segment.Confidence})
	}
	if value.Summary != nil {
		summary := &TranscriptSummaryResponse{Summary: value.Summary.Summary, Decisions: make([]transcription.DecisionItem, 0, len(value.Summary.Decisions)), ActionItems: make([]transcription.ActionItem, 0, len(value.Summary.ActionItems)), OpenQuestions: make([]transcription.OpenQuestion, 0, len(value.Summary.OpenQuestions))}
		for _, item := range value.Summary.Decisions {
			summary.Decisions = append(summary.Decisions, transcription.DecisionItem{Text: item.Text, SourceSegmentIDs: item.SourceSegmentIDs})
		}
		for _, item := range value.Summary.ActionItems {
			summary.ActionItems = append(summary.ActionItems, transcription.ActionItem{Text: item.Text, AssigneeParticipantID: item.AssigneeParticipantID, DueDate: item.DueDate, SourceSegmentIDs: item.SourceSegmentIDs})
		}
		for _, item := range value.Summary.OpenQuestions {
			summary.OpenQuestions = append(summary.OpenQuestions, transcription.OpenQuestion{Text: item.Text, SourceSegmentIDs: item.SourceSegmentIDs})
		}
		result.Summary = summary
	}
	return result
}
