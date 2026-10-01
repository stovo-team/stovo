package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	featuretranscription "stovo-messenger/backend/internal/features/transcription"
	"stovo-messenger/backend/internal/ports"
	"stovo-messenger/backend/internal/transcription"
)

// TranscriptionProviderOptions is the narrow, already-resolved provider
// configuration supplied by bootstrap/runtime composition. Runtime never reads
// the global configuration struct or environment itself.
type TranscriptionProviderOptions struct {
	APIKey           string
	BaseURL          string
	STTModel         string
	ChatModel        string
	CostPerAudioHour float64
}

type TranscriptionProcessorLogger interface {
	Infof(component, format string, args ...any)
	Warnf(component, format string, args ...any)
}

// TranscriptionProcessor owns durable audio-to-transcript orchestration. The
// only app-specific side effects (Socket fanout and generated notes message)
// are callbacks at this outer runtime boundary.
type TranscriptionProcessor struct {
	Sessions    *featuretranscription.SessionService
	Chunks      *featuretranscription.ChunkService
	Segments    *featuretranscription.SegmentService
	Storage     ports.ObjectStore
	CallsBucket string
	Provider    TranscriptionProviderOptions
	DisableNotes bool
	ParticipantName func(string) string
	Logger      TranscriptionProcessorLogger
	Broadcast   func(chatID, callID, sessionID, status string, failureMessage string)
	Publish     func(context.Context, string)
}

func (p TranscriptionProcessor) Process(ctx context.Context, job TranscriptionProcessingJob) {
	if p.Sessions == nil || p.Chunks == nil || p.Segments == nil || p.Storage == nil {
		return
	}
	p.info("processing started session_id=%s call_id=%s", job.SessionID, job.CallID)
	if err := p.Sessions.UpdateStatus(ctx, featuretranscription.StatusUpdate{SessionID: job.SessionID, Status: string(transcription.SessionStatusTranscribing)}); err != nil {
		p.warn("status update failed session_id=%s error=%v", job.SessionID, err)
	}
	p.broadcast(job, string(transcription.SessionStatusTranscribing), "")

	chunks, err := p.Chunks.Uploaded(ctx, job.SessionID)
	if err != nil || len(chunks) == 0 {
		p.warn("no chunks found session_id=%s error=%v", job.SessionID, err)
		p.fail(ctx, job, "no_audio", "No audio chunks were uploaded")
		return
	}
	client := transcription.NewGroqSTTClient(transcription.GroqSTTConfig{APIKey: p.Provider.APIKey, BaseURL: p.Provider.BaseURL, Model: p.Provider.STTModel, TimeoutSeconds: 120, CostPerAudioHour: p.Provider.CostPerAudioHour})
	byParticipant := make(map[string][]featuretranscription.AudioChunk)
	var totalAudioMs int64
	for _, chunk := range chunks {
		byParticipant[chunk.ParticipantID] = append(byParticipant[chunk.ParticipantID], chunk)
		totalAudioMs += chunk.DurationMs
	}
	var all []transcription.TranscriptSegmentForLLM
	languages := make(map[string]bool)
	for participantID, participantChunks := range byParticipant {
		segments, detected := p.transcribeParticipant(ctx, job.CallID, job.SessionID, participantID, participantChunks, client)
		all = append(all, segments...)
		for language := range detected {
			languages[language] = true
		}
	}
	if len(all) == 0 {
		p.fail(ctx, job, "transcription_failed", "No speech could be transcribed. Check the AI Notes speech-to-text model and provider configuration.")
		return
	}
	p.updateMetadata(ctx, job.SessionID, totalAudioMs, languages, client)
	// The exact transcript artifact is the durable source for later export and
	// audit; PostgreSQL segments remain the indexed/queryable projection.
	artifactStore, ok := p.Storage.(ports.BucketObjectStore)
	if !ok {
		p.fail(ctx, job, "transcript_persistence_failed", "Transcript object storage is unavailable")
		return
	}
	artifactKey := fmt.Sprintf("calls/%s/%s/transcript/exact.json", job.ChatID, job.SessionID)
	artifact, err := json.Marshal(struct {
		Version   int                                     `json:"version"`
		CallID    string                                  `json:"callId"`
		SessionID string                                  `json:"sessionId"`
		Model     string                                  `json:"model"`
		Segments  []transcription.TranscriptSegmentForLLM `json:"segments"`
	}{Version: 1, CallID: job.CallID, SessionID: job.SessionID, Model: p.Provider.STTModel, Segments: all})
	if err != nil {
		p.fail(ctx, job, "transcript_persistence_failed", "Transcript artifact could not be serialized")
		return
	}
	if err := artifactStore.SaveToBucket(ctx, p.CallsBucket, artifactKey, artifact, "application/json"); err != nil {
		p.warn("exact transcript artifact write failed session_id=%s error=%v", job.SessionID, err)
		p.fail(ctx, job, "transcript_persistence_failed", "Transcript could not be saved to object storage")
		return
	}
	if err := p.Sessions.SaveExactArtifact(ctx, job.SessionID, artifactKey); err != nil {
		p.warn("exact transcript artifact link failed session_id=%s error=%v", job.SessionID, err)
		p.fail(ctx, job, "transcript_persistence_failed", "Transcript artifact reference could not be saved")
		return
	}
	if !p.DisableNotes {
		p.postProcess(ctx, job.SessionID, all)
	}
	completedAt := time.Now().UTC()
	if err := p.Sessions.UpdateStatus(ctx, featuretranscription.StatusUpdate{SessionID: job.SessionID, Status: string(transcription.SessionStatusReady), CompletedAt: &completedAt}); err != nil {
		p.warn("final status update failed session_id=%s error=%v", job.SessionID, err)
	}
	p.broadcast(job, string(transcription.SessionStatusReady), "")
	if p.Publish != nil {
		p.Publish(ctx, job.SessionID)
	}
	p.info("processing completed session_id=%s call_id=%s segments=%d", job.SessionID, job.CallID, len(all))
}

func (p TranscriptionProcessor) transcribeParticipant(ctx context.Context, callID, sessionID, participantID string, chunks []featuretranscription.AudioChunk, client *transcription.GroqSTTClient) ([]transcription.TranscriptSegmentForLLM, map[string]bool) {
	segments := make([]transcription.TranscriptSegmentForLLM, 0)
	languages := make(map[string]bool)
	// Each authenticated client uploads its own microphone track, so the track
	// participant is the speaker label; Qwen is only responsible for ASR.
	participantName := participantID
	if p.ParticipantName != nil {
		if resolved := strings.TrimSpace(p.ParticipantName(participantID)); resolved != "" {
			participantName = resolved
		}
	}
	for _, chunk := range chunks {
		bucketStore, ok := p.Storage.(ports.BucketObjectReader)
		if !ok {
			p.warn("read chunk failed chunk_id=%s error=storage does not support bucket reads", chunk.ID)
			continue
		}
		audio, err := readTranscriptionChunk(ctx, bucketStore, p.CallsBucket, chunk.ObjectKey)
		if err != nil {
			p.warn("read chunk failed chunk_id=%s error=%v", chunk.ID, err)
			continue
		}
		contentType, filename := "audio/webm", "audio.webm"
		switch chunk.Container {
		case "ogg":
			contentType, filename = "audio/ogg", "audio.ogg"
		case "mp4":
			contentType, filename = "audio/mp4", "audio.m4a"
		}
		response, err := client.Transcribe(ctx, transcription.TranscribeRequest{AudioData: audio, Filename: filename, ContentType: contentType})
		if err != nil {
			p.warn("groq transcribe failed participant=%s chunk=%d error=%v", participantID, chunk.Sequence, err)
			continue
		}
		if response.Language != "" {
			languages[response.Language] = true
		}
		for index, segment := range response.Segments {
			text := strings.TrimSpace(segment.Text)
			if text == "" {
				continue
			}
			language := response.Language
			if segment.Language != "" {
				language = segment.Language
			}
			confidence := 1 + segment.AvgLogProb
			if confidence < 0 {
				confidence = 0
			}
			if confidence > 1 {
				confidence = 1
			}
			id := uuid.NewString()
			start, end := chunk.CallStartMs+int64(segment.Start*1000), chunk.CallStartMs+int64(segment.End*1000)
			if err := p.Segments.Insert(ctx, featuretranscription.SegmentWrite{ID: id, CallID: callID, SessionID: sessionID, ParticipantID: participantID, StartMs: start, EndMs: end, ExactText: text, Language: language, Confidence: confidence, ProviderIndex: index}); err != nil {
				p.warn("insert segment failed seg_id=%s error=%v", id, err)
			}
			segments = append(segments, transcription.TranscriptSegmentForLLM{ID: id, CallID: callID, SessionID: sessionID, ParticipantID: participantID, ParticipantName: participantName, StartMs: start, EndMs: end, Text: text, Language: language, Confidence: confidence})
		}
	}
	return segments, languages
}

func readTranscriptionChunk(ctx context.Context, store ports.BucketObjectReader, bucket, objectKey string) ([]byte, error) {
	return store.ReadFromBucket(ctx, bucket, objectKey)
}

func (p TranscriptionProcessor) updateMetadata(ctx context.Context, sessionID string, audioMs int64, languages map[string]bool, client *transcription.GroqSTTClient) {
	values := make([]string, 0, len(languages))
	for language := range languages {
		values = append(values, language)
	}
	if err := p.Sessions.UpdateMetadata(ctx, featuretranscription.MetadataUpdate{SessionID: sessionID, SubmittedAudioMs: audioMs, EstimatedCostUSD: client.EstimateCost(audioMs), DetectedLanguages: values}); err != nil {
		p.warn("metadata update failed session_id=%s error=%v", sessionID, err)
	}
}

func (p TranscriptionProcessor) postProcess(ctx context.Context, sessionID string, segments []transcription.TranscriptSegmentForLLM) {
	if len(segments) == 0 || p.Provider.APIKey == "" || p.Provider.ChatModel == "" {
		return
	}
	result, err := transcription.NewLLMClient(transcription.LLMConfig{APIKey: p.Provider.APIKey, BaseURL: p.Provider.BaseURL, Model: p.Provider.ChatModel}).PostProcess(ctx, segments)
	if err != nil {
		p.warn("post-processing failed session_id=%s error=%v", sessionID, err)
		return
	}
	if result != nil {
		if err := p.Sessions.SaveSummary(ctx, sessionID, summaryFromResult(*result)); err != nil {
			p.warn("summary update failed session_id=%s error=%v", sessionID, err)
		}
	}
}

func summaryFromResult(result transcription.PostProcessingResult) featuretranscription.Summary {
	summary := featuretranscription.Summary{Summary: result.Summary, Decisions: make([]featuretranscription.Decision, 0, len(result.Decisions)), ActionItems: make([]featuretranscription.ActionItem, 0, len(result.ActionItems)), OpenQuestions: make([]featuretranscription.OpenQuestion, 0, len(result.OpenQuestions))}
	for _, item := range result.Decisions {
		summary.Decisions = append(summary.Decisions, featuretranscription.Decision{Text: item.Text, SourceSegmentIDs: item.SourceSegmentIDs})
	}
	for _, item := range result.ActionItems {
		summary.ActionItems = append(summary.ActionItems, featuretranscription.ActionItem{Text: item.Text, AssigneeParticipantID: item.AssigneeParticipantID, DueDate: item.DueDate, SourceSegmentIDs: item.SourceSegmentIDs})
	}
	for _, item := range result.OpenQuestions {
		summary.OpenQuestions = append(summary.OpenQuestions, featuretranscription.OpenQuestion{Text: item.Text, SourceSegmentIDs: item.SourceSegmentIDs})
	}
	return summary
}

func (p TranscriptionProcessor) fail(ctx context.Context, job TranscriptionProcessingJob, code, message string) {
	if err := p.Sessions.Fail(ctx, featuretranscription.Failure{SessionID: job.SessionID, Code: code, Message: message}); err != nil {
		p.warn("failure status update failed session_id=%s error=%v", job.SessionID, err)
	}
	p.broadcast(job, string(transcription.SessionStatusFailed), message)
}
func (p TranscriptionProcessor) broadcast(job TranscriptionProcessingJob, status, failure string) {
	if p.Broadcast != nil {
		p.Broadcast(job.ChatID, job.CallID, job.SessionID, status, failure)
	}
}
func (p TranscriptionProcessor) info(format string, args ...any) {
	if p.Logger != nil {
		p.Logger.Infof("transcription", format, args...)
	}
}
func (p TranscriptionProcessor) warn(format string, args ...any) {
	if p.Logger != nil {
		p.Logger.Warnf("transcription", format, args...)
	}
}
