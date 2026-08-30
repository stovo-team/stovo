package runtime

import (
	"context"
	"time"
)

// TranscriptionPendingChunks is the runtime-facing readiness check for a
// transcription processing job. The concrete feature store remains outside
// runtime; runtime only owns when background work is allowed to begin.
type TranscriptionPendingChunks interface {
	Pending(context.Context, string) (int, error)
}

// TranscriptionProcessingJob identifies a durable transcription session and
// its call context. It deliberately carries only scalar IDs so runtime does
// not depend on call, storage, or provider implementations.
type TranscriptionProcessingJob struct {
	SessionID string
	CallID    string
	ChatID    string
}

// StartTranscriptionProcessing supervises the settling window between a
// recorder stop and background transcription. Uploads may still be arriving
// after clients receive the stopping event, so runtime waits for the feature
// store to report no pending chunks before invoking process. A store error is
// handled by PendingWork's bounded policy and never leaves an unbounded worker
// behind.
func StartTranscriptionProcessing(ctx context.Context, chunks TranscriptionPendingChunks, job TranscriptionProcessingJob, process func(context.Context, TranscriptionProcessingJob)) {
	if chunks == nil || process == nil || job.SessionID == "" {
		return
	}
	StartPendingWork(ctx, PendingWork{
		InitialDelay: 15 * time.Second,
		PollInterval: time.Second,
		MaxPolls:     30,
		Pending: func(ctx context.Context) (int, error) {
			return chunks.Pending(ctx, job.SessionID)
		},
		Run: func(ctx context.Context) { process(ctx, job) },
	})
}
