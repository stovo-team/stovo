package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"stovo-messenger/backend/internal/adapters/groq"
	"stovo-messenger/backend/internal/transcription"
)

const maxCaptionAudioBytes = 10 << 20

type transcribeCaptionResponse struct {
 Text       string `json:"text"`
 SourceLang string `json:"sourceLang"`
}

func (s *Server) transcribeCaptionAudio(ctx context.Context, audio []byte, filename, contentType string) (transcribeCaptionResponse, error) {
	if len(audio) == 0 {
		return transcribeCaptionResponse{}, errors.New("audio is empty")
	}
	provider := groq.Resolve(&s.cfg, s.logger)
	if provider.APIKey == "" {
		return transcribeCaptionResponse{}, errors.New("caption transcription provider is not configured")
	}
	client := transcription.NewGroqSTTClient(transcription.GroqSTTConfig{
		APIKey: provider.APIKey, BaseURL: provider.BaseURL, Model: provider.STTModel, TimeoutSeconds: 30,
	})
	transcript, err := client.Transcribe(ctx, transcription.TranscribeRequest{AudioData: audio, Filename: filename, ContentType: contentType})
	if err != nil {
		return transcribeCaptionResponse{}, fmt.Errorf("transcribe caption audio: %w", err)
	}
	text := strings.TrimSpace(transcript.Text)
	if text == "" {
		return transcribeCaptionResponse{}, errors.New("speech recognition returned no text")
	}
	return transcribeCaptionResponse{Text: text, SourceLang: transcript.Language}, nil
}

func (s *Server) readCaptionAudio(w http.ResponseWriter, r *http.Request) ([]byte, string, string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxCaptionAudioBytes)
	if err := r.ParseMultipartForm(maxCaptionAudioBytes); err != nil {
		status := http.StatusBadRequest
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			status = http.StatusRequestEntityTooLarge
		}
		s.json(w, status, map[string]string{"message": "invalid audio upload"})
		return nil, "", "", false
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}
	file, header, err := r.FormFile("audio")
	if err != nil {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "audio is required"})
		return nil, "", "", false
	}
	defer func() { _ = file.Close() }()
	audio, err := io.ReadAll(io.LimitReader(file, maxCaptionAudioBytes+1))
	if err != nil {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "could not read audio"})
		return nil, "", "", false
	}
	if len(audio) == 0 {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "audio is empty"})
		return nil, "", "", false
	}
	if len(audio) > maxCaptionAudioBytes {
		s.json(w, http.StatusRequestEntityTooLarge, map[string]string{"message": "audio is too large"})
		return nil, "", "", false
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "audio/webm"
	}
	return audio, filepath.Base(header.Filename), contentType, true
}

func (s *Server) handleTranscribeCaptions(w http.ResponseWriter, r *http.Request, _ userPublic) {
	if chi.URLParam(r, "roomId") == "" {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "roomId is required"})
		return
	}
	audio, filename, contentType, ok := s.readCaptionAudio(w, r)
	if !ok {
		return
	}
	result, err := s.transcribeCaptionAudio(r.Context(), audio, filename, contentType)
	if err != nil {
		if s.logger != nil {
			s.logger.Warnf("captions", "speech recognition failed error=%v", err)
		}
		s.json(w, http.StatusBadGateway, map[string]string{"message": "caption speech recognition failed"})
		return
	}
	s.json(w, http.StatusOK, result)
}

func (s *Server) guestMeetingTranscribeCaptions(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if _, ok := s.validPublicMeeting(r.Context(), token); !ok {
		s.writePublicMeetingUnavailable(w, r)
		return
	}
	audio, filename, contentType, ok := s.readCaptionAudio(w, r)
	if !ok {
		return
	}
	result, err := s.transcribeCaptionAudio(r.Context(), audio, filename, contentType)
	if err != nil {
		if s.logger != nil {
			s.logger.Warnf("captions", "guest speech recognition failed error=%v", err)
		}
		s.json(w, http.StatusBadGateway, map[string]string{"message": "caption speech recognition failed"})
		return
	}
	s.json(w, http.StatusOK, result)
}
