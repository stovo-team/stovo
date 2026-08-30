package runtime

import (
	"strings"

	featuretranscription "stovo-messenger/backend/internal/features/transcription"
)

// FormatTranscriptionNotes converts the durable feature summary into the one
// chat-message payload emitted by the transcription runtime. Keeping this
// operational presentation with the worker prevents the app compatibility host
// from owning post-processing completion semantics.
func FormatTranscriptionNotes(summary featuretranscription.Summary) string {
	sections := make([]string, 0, 4)
	if text := strings.TrimSpace(summary.Summary); text != "" {
		sections = append(sections, "AI call notes\n\n"+text)
	}
	if len(summary.Decisions) > 0 {
		items := make([]string, 0, len(summary.Decisions))
		for _, item := range summary.Decisions {
			if text := strings.TrimSpace(item.Text); text != "" {
				items = append(items, "- "+text)
			}
		}
		if len(items) > 0 {
			sections = append(sections, "Decisions\n"+strings.Join(items, "\n"))
		}
	}
	if len(summary.ActionItems) > 0 {
		items := make([]string, 0, len(summary.ActionItems))
		for _, item := range summary.ActionItems {
			if text := strings.TrimSpace(item.Text); text != "" {
				items = append(items, "- "+text)
			}
		}
		if len(items) > 0 {
			sections = append(sections, "Action items\n"+strings.Join(items, "\n"))
		}
	}
	if len(summary.OpenQuestions) > 0 {
		items := make([]string, 0, len(summary.OpenQuestions))
		for _, item := range summary.OpenQuestions {
			if text := strings.TrimSpace(item.Text); text != "" {
				items = append(items, "- "+text)
			}
		}
		if len(items) > 0 {
			sections = append(sections, "Open questions\n"+strings.Join(items, "\n"))
		}
	}
	content := strings.Join(sections, "\n\n")
	if len(content) > 4000 {
		return strings.TrimSpace(content[:3997]) + "..."
	}
	return content
}
