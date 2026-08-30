package runtime

import (
	"strings"
	"testing"

	featuretranscription "stovo-messenger/backend/internal/features/transcription"
)

func TestFormatTranscriptionNotesPreservesSectionsAndLimit(t *testing.T) {
	got := FormatTranscriptionNotes(featuretranscription.Summary{
		Summary:       "Summary text",
		Decisions:     []featuretranscription.Decision{{Text: "Use ports"}},
		ActionItems:   []featuretranscription.ActionItem{{Text: "Move runtime"}},
		OpenQuestions: []featuretranscription.OpenQuestion{{Text: "Who owns LiveKit?"}},
	})
	for _, want := range []string{"AI call notes", "Decisions\n- Use ports", "Action items\n- Move runtime", "Open questions\n- Who owns LiveKit?"} {
		if !strings.Contains(got, want) {
			t.Fatalf("notes missing %q: %q", want, got)
		}
	}
	long := FormatTranscriptionNotes(featuretranscription.Summary{Summary: strings.Repeat("x", 5000)})
	if len(long) != 4000 || !strings.HasSuffix(long, "...") {
		t.Fatalf("expected bounded notes, got length %d", len(long))
	}
}
