package transcription

import (
	"testing"
)

func TestEstimateCost(t *testing.T) {
	client := NewGroqSTTClient(GroqSTTConfig{
		APIKey:           "test",
		CostPerAudioHour: 0.04,
	})

	tests := []struct {
		name        string
		audioMs     int64
		expectedMin float64
		expectedMax float64
	}{
		{"zero", 0, 0, 0},
		{"one minute", 60_000, 0.00066, 0.00067},
		{"one hour", 3_600_000, 0.0399, 0.0401},
		{"90 seconds", 90_000, 0.001, 0.0011},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cost := client.EstimateCost(tc.audioMs)
			if cost < tc.expectedMin || cost > tc.expectedMax {
				t.Errorf("cost %f not in [%f, %f]", cost, tc.expectedMin, tc.expectedMax)
			}
		})
	}
}

func TestPackedTimeToCallTime(t *testing.T) {
	pkg := SpeechPackage{
		PackageID:     "pkg-1",
		ParticipantID: "user-1",
		Regions: []PackageRegion{
			{PackedStartMs: 0, PackedEndMs: 10000, CallStartMs: 50000, CallEndMs: 60000},
			{PackedStartMs: 10300, PackedEndMs: 25000, CallStartMs: 100000, CallEndMs: 114700},
		},
	}

	tests := []struct {
		name      string
		packedMs  int64
		expected  int64
		wantErr   bool
	}{
		{"start of first region", 0, 50000, false},
		{"middle of first region", 5000, 55000, false},
		{"end of first region", 10000, 60000, false},
		{"in silence gap", 10150, 60000, false},
		{"start of second region", 10300, 100000, false},
		{"middle of second region", 15300, 105000, false},
		{"after all regions", 30000, 0, true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result, err := PackedTimeToCallTime(pkg, tc.packedMs)
			if tc.wantErr {
				if err == nil {
					t.Errorf("expected error but got result %d", result)
				}
				return
			}
			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}
			if result != tc.expected {
				t.Errorf("expected %d, got %d", tc.expected, result)
			}
		})
	}
}

func TestMergeOverlappingRegions(t *testing.T) {
	regions := []SpeechRegion{
		{CallStartMs: 0, CallEndMs: 5000, DurationMs: 5000},
		{CallStartMs: 5200, CallEndMs: 8000, DurationMs: 2800}, // within 500ms gap
		{CallStartMs: 15000, CallEndMs: 20000, DurationMs: 5000}, // separate
	}

	merged := MergeOverlappingRegions(regions, 500)
	if len(merged) != 2 {
		t.Fatalf("expected 2 merged regions, got %d", len(merged))
	}
	if merged[0].CallStartMs != 0 || merged[0].CallEndMs != 8000 {
		t.Errorf("unexpected first merged region: %+v", merged[0])
	}
	if merged[1].CallStartMs != 15000 || merged[1].CallEndMs != 20000 {
		t.Errorf("unexpected second merged region: %+v", merged[1])
	}
}

func TestVTTGeneration(t *testing.T) {
	segments := []VTTSegment{
		{StartMs: 5000, EndMs: 8000, SpeakerName: "Ivan", Text: "Hello world."},
		{StartMs: 10000, EndMs: 14000, SpeakerName: "Maria", Text: "Good morning."},
	}
	vtt := GenerateVTT(segments)
	if vtt == "" {
		t.Error("expected non-empty VTT output")
	}
	if vtt[:6] != "WEBVTT" {
		t.Errorf("VTT should start with WEBVTT, got: %s", vtt[:10])
	}
	if !containsStr(vtt, "00:00:05.000 --> 00:00:08.000") {
		t.Error("VTT missing first timestamp")
	}
	if !containsStr(vtt, "Ivan") {
		t.Error("VTT missing speaker name Ivan")
	}
}

func containsStr(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsRune(s, substr))
}

func containsRune(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestBuildEndpointURLs(t *testing.T) {
	tests := []struct {
		baseURL       string
		wantAudioURL  string
		wantChatURL   string
	}{
		{
			baseURL:      "",
			wantAudioURL: "https://api.groq.com/openai/v1/audio/transcriptions",
			wantChatURL:  "https://api.groq.com/openai/v1/chat/completions",
		},
		{
			baseURL:      "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
			wantAudioURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/audio/transcriptions",
			wantChatURL:  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
		},
		{
			baseURL:      "https://dashscope.aliyuncs.com/compatible-mode/v1",
			wantAudioURL: "https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions",
			wantChatURL:  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
		},
		{
			baseURL:      "https://api.openai.com/v1",
			wantAudioURL: "https://api.openai.com/v1/audio/transcriptions",
			wantChatURL:  "https://api.openai.com/v1/chat/completions",
		},
		{
			baseURL:      "http://whisper:8000/v1",
			wantAudioURL: "http://whisper:8000/v1/audio/transcriptions",
			wantChatURL:  "http://whisper:8000/v1/chat/completions",
		},
	}

	for _, tt := range tests {
		gotAudio := buildAudioTranscriptionsURL(tt.baseURL)
		if gotAudio != tt.wantAudioURL {
			t.Errorf("buildAudioTranscriptionsURL(%q) = %q, want %q", tt.baseURL, gotAudio, tt.wantAudioURL)
		}
		gotChat := buildChatCompletionsURL(tt.baseURL)
		if gotChat != tt.wantChatURL {
			t.Errorf("buildChatCompletionsURL(%q) = %q, want %q", tt.baseURL, gotChat, tt.wantChatURL)
		}
	}
}
