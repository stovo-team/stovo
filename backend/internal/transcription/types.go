package transcription

import "time"

// SessionStatus represents the state of a transcription session.
type SessionStatus string

const (
	SessionStatusCreated        SessionStatus = "created"
	SessionStatusStarting       SessionStatus = "starting"
	SessionStatusRecording      SessionStatus = "recording"
	SessionStatusStopping       SessionStatus = "stopping"
	SessionStatusQueued         SessionStatus = "queued"
	SessionStatusValidatingAudio SessionStatus = "validating_audio"
	SessionStatusTranscribing   SessionStatus = "transcribing"
	SessionStatusPostprocessing  SessionStatus = "postprocessing"
	SessionStatusReady          SessionStatus = "ready"
	SessionStatusFailed         SessionStatus = "failed"
	SessionStatusCancelled      SessionStatus = "cancelled"
)

// Session represents a transcription session.
type Session struct {
	ID              string        `json:"id"`
	CallID          string        `json:"callId"`
	InitiatedBy     string        `json:"initiatedBy"`
	Status          SessionStatus `json:"status"`
	Provider        string        `json:"provider"`
	ProviderModel   string        `json:"providerModel"`
	StartedAt       *time.Time    `json:"startedAt"`
	StoppedAt       *time.Time    `json:"stoppedAt"`
	CompletedAt     *time.Time    `json:"completedAt"`
	SubmittedAudioMs int64        `json:"submittedAudioMs"`
	EstimatedCostUSD *float64     `json:"estimatedCostUsd"`
	DetectedLanguages []string    `json:"detectedLanguages"`
	FailureCode     *string       `json:"failureCode"`
	FailureMessage  *string       `json:"failureMessage"`
	CreatedAt       time.Time     `json:"createdAt"`
	UpdatedAt       time.Time     `json:"updatedAt"`
}

// TranscriptSegment is a chronological segment of the reconstructed transcript.
type TranscriptSegment struct {
	ID              string  `json:"id"`
	CallID          string  `json:"callId"`
	SessionID       string  `json:"sessionId"`
	ParticipantID   string  `json:"participantId"`
	ParticipantName string  `json:"participantName"`
	StartMs         int64   `json:"startMs"`
	EndMs           int64   `json:"endMs"`
	ExactText       string  `json:"exactText"`
	CleanedText     *string `json:"cleanedText"`
	DetectedLanguage *string `json:"detectedLanguage"`
	Confidence      *float64 `json:"confidence"`
	PackageID       *string `json:"packageId"`
}

// UploadChunkResult is the result of completing a chunk upload.
type UploadChunkResult struct {
	ChunkID   string `json:"chunkId"`
	ObjectKey string `json:"objectKey"`
	Valid     bool   `json:"valid"`
	StatusMsg string `json:"statusMsg"`
}

// TranscriptSegmentForLLM is a simplified view passed to the LLM for post-processing.
type TranscriptSegmentForLLM struct {
	ID              string  `json:"id"`
	CallID          string  `json:"callId"`
	SessionID       string  `json:"sessionId"`
	ParticipantID   string  `json:"participantId"`
	ParticipantName string  `json:"participantName"`
	StartMs         int64   `json:"startMs"`
	EndMs           int64   `json:"endMs"`
	Text            string  `json:"text"`
	Language        string  `json:"language,omitempty"`
	Confidence      float64 `json:"confidence"`
}

// DecisionItem is a structured decision extracted from the transcript.
type DecisionItem struct {
	Text             string   `json:"text"`
	SourceSegmentIDs []string `json:"sourceSegmentIds"`
}

// ActionItem is a structured action item extracted from the transcript.
type ActionItem struct {
	Text                  string   `json:"text"`
	AssigneeParticipantID *string  `json:"assigneeParticipantId"`
	DueDate               *string  `json:"dueDate"`
	SourceSegmentIDs      []string `json:"sourceSegmentIds"`
}

// OpenQuestion is an unresolved question from the call.
type OpenQuestion struct {
	Text             string   `json:"text"`
	SourceSegmentIDs []string `json:"sourceSegmentIds"`
}

// PostProcessingResult is the structured output of the LLM post-processing step.
type PostProcessingResult struct {
	Summary       string         `json:"summary"`
	Decisions     []DecisionItem `json:"decisions"`
	ActionItems   []ActionItem   `json:"actionItems"`
	OpenQuestions []OpenQuestion `json:"openQuestions"`
}

// PackageRegion maps packed-audio time back to original call-relative time.
type PackageRegion struct {
	PackedStartMs int64 `json:"packedStartMs"`
	PackedEndMs   int64 `json:"packedEndMs"`
	CallStartMs   int64 `json:"callStartMs"`
	CallEndMs     int64 `json:"callEndMs"`
}

// SpeechRegion is a detected speech interval in a participant's audio stream.
type SpeechRegion struct {
	CallStartMs int64
	CallEndMs   int64
	DurationMs  int64
}

// SpeechPackage groups speech regions for one participant into a Groq submission.
type SpeechPackage struct {
	PackageID       string
	ParticipantID   string
	Regions         []PackageRegion
	TotalDurationMs int64
}

// VTTSegment is one cue for WebVTT generation.
type VTTSegment struct {
	StartMs     int64
	EndMs       int64
	SpeakerName string
	Text        string
}
