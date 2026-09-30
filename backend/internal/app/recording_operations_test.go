package app

import "testing"

func TestFormatRecordingDuration(t *testing.T) {
	tests := []struct {
		durationMs int64
		expected   string
	}{
		{0, "00:00"},
		{5000, "00:05"},
		{65000, "01:05"},
		{599000, "09:59"},
		{3600000, "01:00:00"},
		{3665000, "01:01:05"},
		{7322000, "02:02:02"},
	}

	for _, tt := range tests {
		got := formatRecordingDuration(tt.durationMs)
		if got != tt.expected {
			t.Errorf("formatRecordingDuration(%d) = %s, want %s", tt.durationMs, got, tt.expected)
		}
	}
}

func TestRecordingMessageContent(t *testing.T) {
	tests := []struct {
		name       string
		meeting    string
		durationMs int64
		expected   string
	}{
		{"uses the meeting name", "Leadership review", 74000, "Leadership review Recording (01:14)"},
		{"trims the meeting name", "  Weekly sync  ", 5000, "Weekly sync Recording (00:05)"},
		{"falls back when unnamed", "", 5000, "Meeting Recording (00:05)"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := recordingMessageContent(tt.meeting, tt.durationMs); got != tt.expected {
				t.Errorf("recordingMessageContent(%q, %d) = %q, want %q", tt.meeting, tt.durationMs, got, tt.expected)
			}
		})
	}
}
