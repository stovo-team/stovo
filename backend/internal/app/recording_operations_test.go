package app

import (
	"fmt"
	"testing"
)

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

func TestTargetLangDisplayName(t *testing.T) {
	tests := []struct {
		code     string
		expected string
	}{
		{"en", "English"},
		{"es", "Spanish"},
		{"ru", "Russian"},
		{"de", "German"},
		{"fr", "French"},
		{"zh", "Chinese"},
		{"ja", "Japanese"},
		{"ky", "Kyrgyz"},
		{"kk", "Kazakh"},
		{"uz", "Uzbek"},
		{"custom", "custom"},
	}

	for _, tt := range tests {
		got := targetLangDisplayName(tt.code)
		if got != tt.expected {
			t.Errorf("targetLangDisplayName(%s) = %s, want %s", tt.code, got, tt.expected)
		}
	}
}

func TestCaptionCache(t *testing.T) {
	key := "test:hello"
	val := "Hola"

	setCachedCaption(key, val)
	cached, ok := getCachedCaption(key)
	if !ok || cached != val {
		t.Fatalf("expected %s, got %s (ok=%v)", val, cached, ok)
	}

	// Test cache capacity limit
	for i := 0; i < 5050; i++ {
		setCachedCaption(fmt.Sprintf("key:%d", i), fmt.Sprintf("val:%d", i))
	}
	// Oldest key should have been evicted
	_, stillExists := getCachedCaption(key)
	if stillExists {
		t.Errorf("expected key to be evicted after max capacity reached")
	}
}
