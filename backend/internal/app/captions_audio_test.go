package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"stovo-messenger/backend/internal/config"
)

func TestHandleTranscribeCaptionsUsesDetectedRussianAndSelectedTarget(t *testing.T) {
	var asrModel, chatModel, chatPrompt, uploadedAudio string
	var forcedLanguage bool
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/audio/transcriptions":
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				t.Errorf("parse ASR multipart request: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			asrModel = r.FormValue("model")
			forcedLanguage = r.FormValue("language") != ""
			file, _, err := r.FormFile("file")
			if err != nil {
				t.Errorf("get ASR audio: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			defer file.Close()
			content, _ := io.ReadAll(file)
			uploadedAudio = string(content)
			_, _ = io.WriteString(w, `{"text":"Привет, как дела?","language":"ru"}`)
		case "/v1/chat/completions":
			var request struct {
				Model    string `json:"model"`
				Messages []struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"messages"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Errorf("decode chat request: %v", err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			chatModel = request.Model
			if len(request.Messages) > 0 {
				chatPrompt = request.Messages[0].Content
			}
			_, _ = io.WriteString(w, `{"choices":[{"message":{"content":"Hello, how are you?"}}]}`)
		default:
			t.Errorf("unexpected provider path %q", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer provider.Close()

	app := &Server{cfg: config.Config{
		GroqAPIKey: "test-key", GroqBaseURL: provider.URL,
		GroqSTTModel: "qwen3-asr-flash-2025-09-08", GroqChatModel: "qwen/qwen3.8-27b",
	}}
	body, contentType := captionAudioMultipart(t, "Привет аудио", "en")
	request := httptest.NewRequest(http.MethodPost, "/api/calls/room-1/captions/transcribe", body)
	request.Header.Set("Content-Type", contentType)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("roomId", "room-1")
	request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
	response := httptest.NewRecorder()
	app.handleTranscribeCaptions(response, request, userPublic{})

	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var result struct {
		Text           string `json:"text"`
		SourceLang     string `json:"sourceLang"`
		TranslatedText string `json:"translatedText"`
		TargetLang     string `json:"targetLang"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatalf("decode caption response: %v", err)
	}
	if result.Text != "Привет, как дела?" || result.SourceLang != "ru" || result.TranslatedText != "Hello, how are you?" || result.TargetLang != "en" {
		t.Errorf("caption response = %+v, want Russian source and English translation", result)
	}
	if asrModel != "qwen3-asr-flash-2025-09-08" || chatModel != "qwen/qwen3.8-27b" {
		t.Errorf("models = ASR %q, chat %q", asrModel, chatModel)
	}
	if forcedLanguage {
		t.Error("ASR request forced a language instead of detecting the speech language")
	}
	if uploadedAudio != "Привет аудио" {
		t.Errorf("ASR audio = %q, want uploaded audio bytes", uploadedAudio)
	}
	if !strings.Contains(chatPrompt, "Russian") || !strings.Contains(chatPrompt, "English") {
		t.Errorf("translation prompt = %q, want detected Russian source and English target", chatPrompt)
	}
}

func TestHandleTranscribeCaptionsRejectsMissingOrMalformedAudio(t *testing.T) {
	app := &Server{}
	tests := []struct {
		name        string
		body        *bytes.Buffer
		contentType string
	}{
		{name: "missing audio", body: func() *bytes.Buffer { body, _ := captionAudioMultipart(t, "", "en"); return body }(), contentType: "multipart/form-data"},
		{name: "malformed multipart", body: bytes.NewBufferString("broken"), contentType: "multipart/form-data; boundary=broken"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/calls/room-1/captions/transcribe", test.body)
			request.Header.Set("Content-Type", test.contentType)
			routeContext := chi.NewRouteContext()
			routeContext.URLParams.Add("roomId", "room-1")
			request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
			response := httptest.NewRecorder()
			app.handleTranscribeCaptions(response, request, userPublic{})
			if response.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, body = %s, want bad request", response.Code, response.Body.String())
			}
		})
	}
}

func TestHandleTranscribeCaptionsSurfacesProviderFailure(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, `{"error":{"message":"quota exhausted"}}`)
	}))
	defer provider.Close()
	app := &Server{cfg: config.Config{GroqAPIKey: "test-key", GroqBaseURL: provider.URL, GroqSTTModel: "qwen3-asr-flash"}}
	body, contentType := captionAudioMultipart(t, "audio", "en")
	request := httptest.NewRequest(http.MethodPost, "/api/calls/room-1/captions/transcribe", body)
	request.Header.Set("Content-Type", contentType)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("roomId", "room-1")
	request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
	response := httptest.NewRecorder()
	app.handleTranscribeCaptions(response, request, userPublic{})
	if response.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want bad gateway when the speech provider fails: %s", response.Code, response.Body.String())
	}
}

func TestTranscribeCaptionsRouteRequiresMemberAuthentication(t *testing.T) {
	app := &Server{}
	handler := app.authenticated(app.handleTranscribeCaptions)
	request := httptest.NewRequest(http.MethodPost, "/api/calls/room-1/captions/transcribe", nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("roomId", "room-1")
	request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want unauthorized for member caption transcription", response.Code)
	}
}

func TestAuthenticatedTranscribeCaptionsRouteReachesAudioValidation(t *testing.T) {
	app := &Server{cfg: config.Config{JWTSecret: "caption-test-secret"}}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"is_superadmin": true,
		"exp":           time.Now().Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte(app.cfg.JWTSecret))
	if err != nil {
		t.Fatalf("sign authenticated test token: %v", err)
	}
	handler := app.authenticated(app.handleTranscribeCaptions)
	request := httptest.NewRequest(http.MethodPost, "/api/calls/room-1/captions/transcribe", nil)
	request.Header.Set("Authorization", "Bearer "+signed)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("roomId", "room-1")
	request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want authenticated request to reach audio validation", response.Code)
	}
}

func TestGuestTranscribeCaptionsRejectsUnknownGuestToken(t *testing.T) {
	app := &Server{}
	request := httptest.NewRequest(http.MethodPost, "/api/guest-meetings/public/unknown/captions/transcribe", nil)
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("token", "unknown")
	request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
	response := httptest.NewRecorder()
	app.guestMeetingTranscribeCaptions(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want not found for unknown guest token", response.Code)
	}
}

func TestGuestTranscribeCaptionsValidatesMeetingLifecycle(t *testing.T) {
	now := time.Now().UTC()
	tests := []struct {
		name      string
		expiresAt time.Time
		revokedAt any
		wantCode  int
	}{
		{name: "valid token reaches audio validation", expiresAt: now.Add(time.Hour), wantCode: http.StatusBadRequest},
		{name: "expired token rejected", expiresAt: now.Add(-time.Hour), wantCode: http.StatusGone},
		{name: "revoked token rejected", expiresAt: now.Add(time.Hour), revokedAt: now, wantCode: http.StatusNotFound},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			app := &Server{guestDB: captionGuestTestDB(test.expiresAt, test.revokedAt)}
			defer app.guestDB.Close()
			request := httptest.NewRequest(http.MethodPost, "/api/guest-meetings/public/token/captions/transcribe", nil)
			routeContext := chi.NewRouteContext()
			routeContext.URLParams.Add("token", "token")
			request = request.WithContext(context.WithValue(request.Context(), chi.RouteCtxKey, routeContext))
			response := httptest.NewRecorder()
			app.guestMeetingTranscribeCaptions(response, request)
			if response.Code != test.wantCode {
				t.Fatalf("status = %d, want %d: %s", response.Code, test.wantCode, response.Body.String())
			}
		})
	}
}

func captionAudioMultipart(t *testing.T, audio, target string) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if target != "" {
		if err := writer.WriteField("targetLang", target); err != nil {
			t.Fatal(err)
		}
	}
	if audio != "" {
		file, err := writer.CreateFormFile("audio", "caption.webm")
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.WriteString(file, audio); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return &body, writer.FormDataContentType()
}
