package runtime

import (
	"context"
	"testing"
)

type transcriptionChunkFake struct {
	calls int
}

func (f *transcriptionChunkFake) Pending(context.Context, string) (int, error) {
	f.calls++
	return 0, nil
}

func TestStartTranscriptionProcessingRejectsIncompleteJobs(t *testing.T) {
	chunks := &transcriptionChunkFake{}
	called := false
	StartTranscriptionProcessing(context.Background(), chunks, TranscriptionProcessingJob{}, func(context.Context, TranscriptionProcessingJob) {
		called = true
	})
	if chunks.calls != 0 {
		t.Fatalf("pending calls = %d, want 0", chunks.calls)
	}
	if called {
		t.Fatal("processor called for incomplete job")
	}
}

func TestStartTranscriptionProcessingAcceptsFeatureOwnedChunkPort(t *testing.T) {
	// The concrete timing policy is exercised by RunPendingWork tests. This
	// compile-time/use test protects the narrow runtime seam used by app.
	var _ TranscriptionPendingChunks = (*transcriptionChunkFake)(nil)
}
