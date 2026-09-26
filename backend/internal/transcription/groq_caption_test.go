package transcription

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCaptionASRUsesConfiguredModelAndAutomaticallyDetectsRussian(t *testing.T) {
	var receivedAudio string
	var receivedModel string
	var hasLanguageField bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/audio/transcriptions" {
			t.Errorf("request path = %q", r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse multipart audio request: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		receivedModel = r.FormValue("model")
		hasLanguageField = r.FormValue("language") != ""
		file, _, err := r.FormFile("file")
		if err != nil {
			t.Errorf("read audio file: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		defer func() { _ = file.Close() }()
		content, _ := io.ReadAll(file)
		receivedAudio = string(content)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"text":"Привет, как дела?","language":"ru"}`)
	}))
	defer server.Close()

	client := NewGroqSTTClient(GroqSTTConfig{
		APIKey: "test-key", Model: "qwen3-asr-flash-2025-09-08", BaseURL: server.URL,
	})
	got, err := client.Transcribe(context.Background(), TranscribeRequest{
		AudioData: []byte("captured microphone audio"), Filename: "caption.webm", ContentType: "audio/webm",
	})
	if err != nil {
		t.Fatalf("Transcribe() error = %v", err)
	}
	if got.Text != "Привет, как дела?" || got.Language != "ru" {
		t.Fatalf("Transcribe() = %+v, want Russian transcript and detected language", got)
	}
	if receivedModel != "qwen3-asr-flash-2025-09-08" {
		t.Errorf("ASR model = %q, want configured AI Notes model", receivedModel)
	}
	if hasLanguageField {
		t.Error("ASR request forced a language instead of detecting it from audio")
	}
	if receivedAudio != "captured microphone audio" {
		t.Errorf("ASR audio = %q, want the captured microphone bytes", receivedAudio)
	}
}

func TestCaptionASRRejectsMalformedProviderResponseAndPropagatesProviderErrors(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		body       string
		wantErrSub string
	}{
		{name: "malformed response", status: http.StatusOK, body: "not-json", wantErrSub: "unmarshal"},
		{name: "provider error", status: http.StatusForbidden, body: `{"error":{"message":"quota exhausted"}}`, wantErrSub: "quota exhausted"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
				_, _ = io.WriteString(w, tt.body)
			}))
			defer server.Close()
			client := NewGroqSTTClient(GroqSTTConfig{APIKey: "test-key", Model: "qwen3-asr-flash", BaseURL: server.URL})
			_, err := client.Transcribe(context.Background(), TranscribeRequest{AudioData: []byte("audio"), Filename: "audio.webm"})
			if err == nil || !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tt.wantErrSub)) {
				t.Fatalf("Transcribe() error = %v, want error containing %q", err, tt.wantErrSub)
			}
		})
	}
}
