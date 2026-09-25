package transcription

import (
	"fmt"
	"strings"
)

// GenerateVTT generates a WebVTT file from transcript segments.
// Segments should be pre-sorted chronologically by StartMs.
func GenerateVTT(segments []VTTSegment) string {
	var sb strings.Builder
	sb.WriteString("WEBVTT\n\n")

	for i, seg := range segments {
		// Cue identifier
		fmt.Fprintf(&sb, "%d\n", i+1)
		// Timestamps
		fmt.Fprintf(&sb, "%s --> %s\n", formatVTTTime(seg.StartMs), formatVTTTime(seg.EndMs))
		// Speaker + text
		speaker := escapeVTTText(seg.SpeakerName)
		text := escapeVTTText(seg.Text)
		if speaker != "" {
			fmt.Fprintf(&sb, "<%s> %s\n", speaker, text)
		} else {
			sb.WriteString(text + "\n")
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

func formatVTTTime(ms int64) string {
	totalSeconds := ms / 1000
	milliseconds := ms % 1000
	hours := totalSeconds / 3600
	minutes := (totalSeconds % 3600) / 60
	seconds := totalSeconds % 60
	return fmt.Sprintf("%02d:%02d:%02d.%03d", hours, minutes, seconds, milliseconds)
}

func escapeVTTText(text string) string {
	// WebVTT cue text must not contain "-->" or blank lines
	text = strings.ReplaceAll(text, "-->", "--&gt;")
	// Replace double newlines to avoid cue boundary confusion
	text = strings.ReplaceAll(text, "\n\n", " ")
	text = strings.ReplaceAll(text, "\n", " ")
	return strings.TrimSpace(text)
}
