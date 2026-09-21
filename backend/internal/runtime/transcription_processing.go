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

// StartTranscriptionProcessing supervises the brief settling window between a
// recorder stop and background transcription. The client flushes its final
// chunk before calling stop, so a small cushion is enough before the pending
// upload guard takes over. A store error is handled by PendingWork's bounded
// policy and never leaves an unbounded worker behind.
func StartTranscriptionProcessing(ctx context.Context, chunks TranscriptionPendingChunks, job TranscriptionProcessingJob, process func(context.Context, TranscriptionProcessingJob)) {
	if chunks == nil || process == nil || job.SessionID == "" {
		return
	}
	StartPendingWork(ctx, PendingWork{
		InitialDelay: 3 * time.Second,
		PollInterval: time.Second,
		MaxPolls:     30,
		Pending: func(ctx context.Context) (int, error) {
			return chunks.Pending(ctx, job.SessionID)
		},
		Run: func(ctx context.Context) { process(ctx, job) },
	})
}
