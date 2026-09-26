package config_test

import (
	"testing"

	"stovo-messenger/backend/internal/adapters/groq"
	"stovo-messenger/backend/internal/config"
)

func TestCaptionSpeechRecognitionDefaultsToQwenASR(t *testing.T) {
	t.Setenv("GROQ_STT_MODEL", "")
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.GroqSTTModel != "qwen3-asr-flash-2025-09-08" {
		t.Fatalf("GroqSTTModel = %q, want Qwen ASR default", cfg.GroqSTTModel)
	}
	if provider := groq.Resolve(&cfg, nil); provider.STTModel != "qwen3-asr-flash-2025-09-08" {
		t.Fatalf("resolved STT model = %q, want Qwen ASR default", provider.STTModel)
	}
}
