package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"stovo-messenger/backend/internal/adapters/groq"
)

var (
	captionCacheLock sync.RWMutex
	captionCacheMap  = make(map[string]string)
	captionCacheKeys = make([]string, 0, 5000)
)

const maxCaptionCacheEntries = 5000

func getCachedCaption(key string) (string, bool) {
	captionCacheLock.RLock()
	defer captionCacheLock.RUnlock()
	val, ok := captionCacheMap[key]
	return val, ok
}

func setCachedCaption(key, val string) {
	captionCacheLock.Lock()
	defer captionCacheLock.Unlock()
	if _, exists := captionCacheMap[key]; !exists {
		if len(captionCacheKeys) >= maxCaptionCacheEntries {
			oldest := captionCacheKeys[0]
			captionCacheKeys = captionCacheKeys[1:]
			delete(captionCacheMap, oldest)
		}
		captionCacheKeys = append(captionCacheKeys, key)
	}
	captionCacheMap[key] = val
}

func targetLangDisplayName(code string) string {
	switch strings.ToLower(strings.TrimSpace(code)) {
	case "en", "eng":
		return "English"
	case "es", "spa":
		return "Spanish"
	case "ru", "rus":
		return "Russian"
	case "de", "deu", "ger":
		return "German"
	case "fr", "fra":
		return "French"
	case "zh", "zho", "chi":
		return "Chinese"
	case "ja", "jpn":
		return "Japanese"
	case "ko", "kor":
		return "Korean"
	case "it", "ita":
		return "Italian"
	case "pt", "por":
		return "Portuguese"
	case "tr", "tur":
		return "Turkish"
	case "ar", "ara":
		return "Arabic"
	case "ky", "kir":
		return "Kyrgyz"
	case "kk", "kaz":
		return "Kazakh"
	case "uz", "uzb":
		return "Uzbek"
	default:
		if code != "" {
			return code
		}
		return "English"
	}
}

type translateCaptionRequest struct {
	Text       string `json:"text"`
	SourceLang string `json:"sourceLang"`
	TargetLang string `json:"targetLang"`
}

type translateCaptionResponse struct {
	Text           string `json:"text"`
	TranslatedText string `json:"translatedText"`
	TargetLang     string `json:"targetLang"`
}

func (s *Server) translateCaption(ctx context.Context, text, sourceLang, targetLang string) (string, error) {
	cleanText := strings.TrimSpace(text)
	if cleanText == "" {
		return "", nil
	}
	if targetLang == "" {
		targetLang = "en"
	}
	if strings.EqualFold(sourceLang, targetLang) {
		return cleanText, nil
	}

	cacheKey := strings.ToLower(targetLang) + ":" + cleanText
	if cached, ok := getCachedCaption(cacheKey); ok {
		return cached, nil
	}

	provider := groq.Resolve(&s.cfg, s.logger)
	if provider.APIKey == "" {
		return cleanText, nil
	}

	model := provider.ChatModel
	if model == "" {
		model = "llama-3.1-8b-instant"
	}

	langName := targetLangDisplayName(targetLang)
	systemPrompt := fmt.Sprintf("You are an ultra-fast live speech subtitle translator. Translate the following speech transcript segment into %s. Respond ONLY with the translation text without quotes, explanation, or markdown formatting.", langName)

	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": cleanText},
		},
		"temperature": 0.1,
		"max_tokens":  256,
	}

	reqBody, err := json.Marshal(payload)
	if err != nil {
		return cleanText, err
	}

	baseURL := strings.TrimRight(strings.TrimSpace(provider.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.groq.com/openai/v1"
	}
	if !strings.HasSuffix(baseURL, "/chat/completions") {
		if strings.HasSuffix(baseURL, "/v1") {
			baseURL = baseURL + "/chat/completions"
		} else if strings.Contains(baseURL, "groq.com") {
			baseURL = baseURL + "/openai/v1/chat/completions"
		} else {
			baseURL = baseURL + "/v1/chat/completions"
		}
	}

	reqCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(reqCtx, http.MethodPost, baseURL, bytes.NewReader(reqBody))
	if err != nil {
		return cleanText, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		s.logger.Warnf("captions", "translate http request failed text=%q error=%v", cleanText, err)
		return cleanText, nil
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil || resp.StatusCode != http.StatusOK {
		s.logger.Warnf("captions", "translate response error status=%d body=%s", resp.StatusCode, string(bodyBytes))
		return cleanText, nil
	}

	var chatResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(bodyBytes, &chatResp); err != nil || len(chatResp.Choices) == 0 {
		return cleanText, nil
	}

	translated := strings.TrimSpace(chatResp.Choices[0].Message.Content)
	if translated == "" {
		translated = cleanText
	}
	// Strip wrapping quotes if LLM added any
	translated = strings.Trim(translated, `"'“”`)

	setCachedCaption(cacheKey, translated)
	return translated, nil
}

func (s *Server) handleTranslateCaptions(w http.ResponseWriter, r *http.Request, user userPublic) {
	roomID := chi.URLParam(r, "roomId")
	if roomID == "" {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "roomId is required"})
		return
	}

	var req translateCaptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
		return
	}

	translated, err := s.translateCaption(r.Context(), req.Text, req.SourceLang, req.TargetLang)
	if err != nil {
		s.logger.Warnf("captions", "translation failed text=%q target=%s error=%v", req.Text, req.TargetLang, err)
	}

	s.json(w, http.StatusOK, translateCaptionResponse{
		Text:           req.Text,
		TranslatedText: translated,
		TargetLang:     req.TargetLang,
	})
}

func (s *Server) guestMeetingTranslateCaptions(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if _, ok := s.validPublicMeeting(r.Context(), token); !ok {
		s.writePublicMeetingUnavailable(w, r)
		return
	}

	var req translateCaptionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.json(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
		return
	}

	translated, err := s.translateCaption(r.Context(), req.Text, req.SourceLang, req.TargetLang)
	if err != nil {
		s.logger.Warnf("captions", "guest translation failed text=%q target=%s error=%v", req.Text, req.TargetLang, err)
	}

	s.json(w, http.StatusOK, translateCaptionResponse{
		Text:           req.Text,
		TranslatedText: translated,
		TargetLang:     req.TargetLang,
	})
}
