package app

import (
	"strings"
	"testing"

	featuretranscription "stovo-messenger/backend/internal/features/transcription"
	workruntime "stovo-messenger/backend/internal/runtime"
)

func TestFormatAICallNotes(t *testing.T) {
	got := workruntime.FormatTranscriptionNotes(featuretranscription.Summary{
		Summary:       "We agreed on the launch date.",
		Decisions:     []featuretranscription.Decision{{Text: "Launch on Friday"}},
		ActionItems:   []featuretranscription.ActionItem{{Text: "Prepare the release notes"}},
		OpenQuestions: []featuretranscription.OpenQuestion{{Text: "Who will monitor the rollout?"}},
	})

	want := "AI call notes\n\nWe agreed on the launch date.\n\n" +
		"Decisions\n- Launch on Friday\n\n" +
		"Action items\n- Prepare the release notes\n\n" +
		"Open questions\n- Who will monitor the rollout?"
	if got != want {
		t.Fatalf("formatAICallNotes() = %q, want %q", got, want)
	}
}

func TestFormatAICallNotesKeepsTranscriptMarkerAndCapsMessageLength(t *testing.T) {
	if got := workruntime.FormatTranscriptionNotes(featuretranscription.Summary{}); got != "AI call notes" {
		t.Fatalf("formatAICallNotes(empty) = %q, want transcript marker", got)
	}

	got := workruntime.FormatTranscriptionNotes(featuretranscription.Summary{Summary: strings.Repeat("a", 5000)})
	if len(got) != 4000 || !strings.HasSuffix(got, "...") {
		t.Fatalf("long notes length/suffix = (%d, %t), want (4000, true)", len(got), strings.HasSuffix(got, "..."))
	}
}
