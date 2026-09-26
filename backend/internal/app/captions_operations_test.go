package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"stovo-messenger/backend/internal/config"
)

func TestTranslateCaptionIncludesSourceAndTargetLanguages(t *testing.T) {
	var systemPrompt string
	var requestModel, authorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Model    string `json:"model"`
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode provider request: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if len(request.Messages) > 0 {
			systemPrompt = request.Messages[0].Content
		}
		requestModel = request.Model
		authorization = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Hello, how are you?"}}]}`))
	}))
	defer server.Close()

	app := &Server{cfg: config.Config{GroqAPIKey: "test-key", GroqBaseURL: server.URL, GroqChatModel: "test-model"}}
	got, err := app.translateCaption(context.Background(), "Привет, как дела?", "ru", "en")
	if err != nil {
		t.Fatalf("translateCaption() error = %v", err)
	}
	if got != "Hello, how are you?" {
		t.Fatalf("translateCaption() = %q", got)
	}
	if requestModel != "test-model" {
		t.Errorf("provider model = %q, want configured override %q", requestModel, "test-model")
	}
	if authorization != "Bearer test-key" {
		t.Errorf("provider authorization = %q, want configured key", authorization)
	}
	for _, language := range []string{"Russian", "English"} {
		if !strings.Contains(systemPrompt, language) {
			t.Errorf("system prompt %q does not identify %s", systemPrompt, language)
		}
	}
}

func TestTranslateCaptionDefaultsToQwenChatModel(t *testing.T) {
	var requestModel string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestModel = requestModelFromBody(t, r)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Hello"}}]}`))
	}))
	defer server.Close()

	app := &Server{cfg: config.Config{GroqAPIKey: "test-key", GroqBaseURL: server.URL}}
	if _, err := app.translateCaption(context.Background(), "Привет", "", "en"); err != nil {
		t.Fatalf("translateCaption() error = %v", err)
	}
	if requestModel != "qwen/qwen3.8-27b" {
		t.Errorf("provider model = %q, want Qwen chat model %q", requestModel, "qwen/qwen3.8-27b")
	}
}

func requestModelFromBody(t *testing.T, r *http.Request) string {
	t.Helper()
	var request struct {
		Model string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		t.Errorf("decode provider model: %v", err)
		return ""
	}
	return request.Model
}

func TestTranslateCaptionDetectsSourceWhenUnknown(t *testing.T) {
	var systemPrompt string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode provider request: %v", err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if len(request.Messages) > 0 {
			systemPrompt = request.Messages[0].Content
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"Good morning"}}]}`))
	}))
	defer server.Close()

	app := &Server{cfg: config.Config{GroqAPIKey: "test-key", GroqBaseURL: server.URL, GroqChatModel: "test-model"}}
	_, err := app.translateCaption(context.Background(), "Доброе утро", "", "en")
	if err != nil {
		t.Fatalf("translateCaption() error = %v", err)
	}
	if !strings.Contains(strings.ToLower(systemPrompt), "identify the language") {
		t.Errorf("system prompt should direct automatic source-language detection, got %q", systemPrompt)
	}
}

func TestCaptionCacheSeparatesSourceLanguages(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"translation-` + string(rune('0'+calls)) + `"}}]}`))
	}))
	defer server.Close()

	app := &Server{cfg: config.Config{GroqAPIKey: "test-key", GroqBaseURL: server.URL, GroqChatModel: "test-model"}}
	const text = "cache-source-context-regression"
	first, err := app.translateCaption(context.Background(), text, "ru", "en")
	if err != nil {
		t.Fatalf("first translateCaption() error = %v", err)
	}
	second, err := app.translateCaption(context.Background(), text, "de", "en")
	if err != nil {
		t.Fatalf("second translateCaption() error = %v", err)
	}
	if calls != 2 || first == second {
		t.Fatalf("different source languages reused a cache entry: calls=%d, first=%q, second=%q", calls, first, second)
	}
}
