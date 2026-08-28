package app

import (
	"strings"
	"testing"

	"stovo-messenger/backend/internal/transcription"
)

func TestFormatAICallNotes(t *testing.T) {
	got := formatAICallNotes(transcription.PostProcessingResult{
		Summary:       "We agreed on the launch date.",
		Decisions:     []transcription.DecisionItem{{Text: "Launch on Friday"}},
		ActionItems:   []transcription.ActionItem{{Text: "Prepare the release notes"}},
		OpenQuestions: []transcription.OpenQuestion{{Text: "Who will monitor the rollout?"}},
	})

	want := "AI call notes\n\nWe agreed on the launch date.\n\n" +
		"Decisions\n- Launch on Friday\n\n" +
		"Action items\n- Prepare the release notes\n\n" +
		"Open questions\n- Who will monitor the rollout?"
	if got != want {
		t.Fatalf("formatAICallNotes() = %q, want %q", got, want)
	}
}

func TestFormatAICallNotesOmitsEmptySectionsAndCapsMessageLength(t *testing.T) {
	if got := formatAICallNotes(transcription.PostProcessingResult{}); got != "" {
		t.Fatalf("formatAICallNotes(empty) = %q, want empty", got)
	}

	got := formatAICallNotes(transcription.PostProcessingResult{Summary: strings.Repeat("a", 5000)})
	if len(got) != 4000 || !strings.HasSuffix(got, "...") {
		t.Fatalf("long notes length/suffix = (%d, %t), want (4000, true)", len(got), strings.HasSuffix(got, "..."))
	}
}
