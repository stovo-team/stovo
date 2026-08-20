package transcription

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)



const (
	groqAPIBase     = "https://api.groq.com"
	defaultSTTModel = "whisper-large-v3-turbo"
)

// GroqWordTimestamp is a word-level timestamp from Groq.
type GroqWordTimestamp struct {
	Word  string  `json:"word"`
	Start float64 `json:"start"`
	End   float64 `json:"end"`
}

// GroqSegment is a segment from Groq verbose_json response.
type GroqSegment struct {
	ID               int                 `json:"id"`
	Text             string              `json:"text"`
	Start            float64             `json:"start"`
	End              float64             `json:"end"`
	Language         string              `json:"language"`
	Words            []GroqWordTimestamp `json:"words"`
	AvgLogProb       float64             `json:"avg_logprob"`
	CompressionRatio float64             `json:"compression_ratio"`
	NoSpeechProb     float64             `json:"no_speech_prob"`
	Temperature      float64             `json:"temperature"`
}

// GroqTranscriptionResponse is the verbose_json response from Groq transcription.
type GroqTranscriptionResponse struct {
	Text     string        `json:"text"`
	Language string        `json:"language"`
	Duration float64       `json:"duration"`
	Segments []GroqSegment `json:"segments"`
	Words    []GroqWordTimestamp `json:"words"`
}

// GroqSTTConfig holds the Groq STT configuration.
type GroqSTTConfig struct {
	APIKey           string
	Model            string
	BaseURL          string
	TimeoutSeconds   int
	MaxConcurrency   int
	CostPerAudioHour float64
}

// GroqSTTClient is a Groq Whisper STT client.
type GroqSTTClient struct {
	cfg    GroqSTTConfig
	client *http.Client
}

// NewGroqSTTClient creates a new Groq STT client.
func NewGroqSTTClient(cfg GroqSTTConfig) *GroqSTTClient {
	if cfg.BaseURL == "" {
		cfg.BaseURL = groqAPIBase
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	if cfg.Model == "" {
		cfg.Model = defaultSTTModel
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 120
	}
	return &GroqSTTClient{
		cfg: cfg,
		client: &http.Client{
			Timeout: time.Duration(cfg.TimeoutSeconds) * time.Second,
		},
	}
}

// TranscribeRequest contains the audio data and metadata for transcription.
type TranscribeRequest struct {
	AudioData   []byte
	Filename    string // e.g. "audio.webm" or "audio.ogg"
	ContentType string // e.g. "audio/webm" or "audio/ogg"
}

// Transcribe submits audio to Groq Whisper and returns the verbose_json response.
// It retries up to 3 times on transient errors and rate limits.
func (c *GroqSTTClient) Transcribe(ctx context.Context, req TranscribeRequest) (*GroqTranscriptionResponse, error) {
	var lastErr error
	maxRetries := 3
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(attempt) * 2 * time.Second):
			}
		}
		resp, err := c.transcribeOnce(ctx, req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		// Only retry on transient errors
		if !isTransientGroqError(err) {
			return nil, err
		}
	}
	return nil, fmt.Errorf("groq transcription failed after %d attempts: %w", maxRetries, lastErr)
}

func (c *GroqSTTClient) transcribeOnce(ctx context.Context, req TranscribeRequest) (*GroqTranscriptionResponse, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// model field
	if err := mw.WriteField("model", c.cfg.Model); err != nil {
		return nil, fmt.Errorf("groq: write model field: %w", err)
	}
	// response_format field
	if err := mw.WriteField("response_format", "verbose_json"); err != nil {
		return nil, fmt.Errorf("groq: write response_format field: %w", err)
	}
	// timestamp_granularities[] field (segment and word level)
	if err := mw.WriteField("timestamp_granularities[]", "segment"); err != nil {
		return nil, fmt.Errorf("groq: write timestamp_granularities field: %w", err)
	}
	if err := mw.WriteField("timestamp_granularities[]", "word"); err != nil {
		return nil, fmt.Errorf("groq: write timestamp_granularities field: %w", err)
	}
	// temperature = 0
	if err := mw.WriteField("temperature", "0"); err != nil {
		return nil, fmt.Errorf("groq: write temperature field: %w", err)
	}
	// NOTE: language is intentionally omitted for automatic detection

	filename := req.Filename
	if filename == "" {
		filename = "audio.webm"
	}
	contentType := req.ContentType
	if contentType == "" {
		contentType = "audio/webm"
	}

	fw, err := mw.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("groq: create form file: %w", err)
	}
	if _, err := fw.Write(req.AudioData); err != nil {
		return nil, fmt.Errorf("groq: write audio data: %w", err)
	}
	if err := mw.Close(); err != nil {
		return nil, fmt.Errorf("groq: close multipart writer: %w", err)
	}

	if isDashScopeOrMaas(c.cfg.BaseURL) {
		return c.transcribeViaChatAudio(ctx, req)
	}

	endpointURL := buildAudioTranscriptionsURL(c.cfg.BaseURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpointURL, &buf)
	if err != nil {
		return nil, fmt.Errorf("groq: build request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	httpReq.Header.Set("Content-Type", mw.FormDataContentType())

	httpResp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, &TransientError{Err: fmt.Errorf("groq: http request: %w", err)}
	}
	defer httpResp.Body.Close()

	body, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, &TransientError{Err: fmt.Errorf("groq: read response body: %w", err)}
	}

	if httpResp.StatusCode == http.StatusTooManyRequests {
		retryAfter := httpResp.Header.Get("Retry-After")
		delay := 5 * time.Second
		if s, err := strconv.Atoi(retryAfter); err == nil && s > 0 {
			delay = time.Duration(s) * time.Second
		}
		time.Sleep(delay)
		return nil, &TransientError{Err: fmt.Errorf("groq: rate limited (429)")}
	}
	if httpResp.StatusCode >= 500 {
		return nil, &TransientError{Err: fmt.Errorf("groq: server error %d: %s", httpResp.StatusCode, string(body))}
	}
	if httpResp.StatusCode == http.StatusNotFound {
		// Fallback to chat completions with input_audio if /audio/transcriptions is not found
		return c.transcribeViaChatAudio(ctx, req)
	}
	if httpResp.StatusCode != http.StatusOK {
		var groqErr struct {
			Error struct {
				Message string `json:"message"`
				Type    string `json:"type"`
				Code    string `json:"code"`
			} `json:"error"`
		}
		if json.Unmarshal(body, &groqErr) == nil && groqErr.Error.Message != "" {
			return nil, fmt.Errorf("groq API error (%d): %s", httpResp.StatusCode, groqErr.Error.Message)
		}
		return nil, fmt.Errorf("groq: unexpected status %d: %s", httpResp.StatusCode, string(body))
	}

	var result GroqTranscriptionResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("groq: unmarshal response: %w", err)
	}
	return &result, nil
}

func (c *GroqSTTClient) transcribeViaChatAudio(ctx context.Context, req TranscribeRequest) (*GroqTranscriptionResponse, error) {
	mime := req.ContentType
	if mime == "" {
		mime = "audio/webm"
	}
	b64 := base64.StdEncoding.EncodeToString(req.AudioData)
	dataURI := fmt.Sprintf("data:%s;base64,%s", mime, b64)

	format := "wav"
	if strings.Contains(mime, "mp3") || strings.Contains(mime, "mpeg") {
		format = "mp3"
	} else if strings.Contains(mime, "webm") {
		format = "webm"
	} else if strings.Contains(mime, "ogg") || strings.Contains(mime, "opus") {
		format = "ogg"
	} else if strings.Contains(mime, "m4a") || strings.Contains(mime, "aac") {
		format = "m4a"
	}

	chatURL := buildChatCompletionsURL(c.cfg.BaseURL)

	// Schema 1: DashScope Multimodal audio_url schema
	payload1 := map[string]any{
		"model": c.cfg.Model,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{
						"type": "audio_url",
						"audio_url": map[string]any{
							"url": dataURI,
						},
					},
					{
						"type": "text",
						"text": "Transcribe the audio speech word-for-word into text without translating.",
					},
				},
			},
		},
	}

	resp, err := c.sendChatAudioRequest(ctx, chatURL, payload1)
	if err == nil {
		return resp, nil
	}

	// Schema 2: OpenAI input_audio schema (raw base64 + format)
	payload2 := map[string]any{
		"model": c.cfg.Model,
		"messages": []map[string]any{
			{
				"role": "user",
				"content": []map[string]any{
					{
						"type": "input_audio",
						"input_audio": map[string]any{
							"data":   b64,
							"format": format,
						},
					},
					{
						"type": "text",
						"text": "Transcribe the audio speech word-for-word into text without translating.",
					},
				},
			},
		},
	}

	resp2, err2 := c.sendChatAudioRequest(ctx, chatURL, payload2)
	if err2 == nil {
		return resp2, nil
	}

	return nil, err
}

func (c *GroqSTTClient) sendChatAudioRequest(ctx context.Context, chatURL string, payload any) (*GroqTranscriptionResponse, error) {
	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal chat audio request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, chatURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("build chat audio request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	httpResp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, &TransientError{Err: fmt.Errorf("chat audio http request: %w", err)}
	}
	defer httpResp.Body.Close()

	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, &TransientError{Err: fmt.Errorf("read chat audio response: %w", err)}
	}

	if httpResp.StatusCode != http.StatusOK {
		var rawMap map[string]any
		msg := ""
		if err := json.Unmarshal(respBody, &rawMap); err == nil {
			if m, ok := rawMap["message"].(string); ok && m != "" {
				msg = m
			} else if e, ok := rawMap["error"].(map[string]any); ok {
				if m, ok := e["message"].(string); ok && m != "" {
					msg = m
				}
			} else if c, ok := rawMap["code"].(string); ok && c != "" {
				msg = c
			}
		}
		if msg == "" {
			msg = string(respBody)
		}
		return nil, fmt.Errorf("ASR API error (%d): %s", httpResp.StatusCode, msg)
	}

	var chatResp struct {
		Choices []struct {
			Message struct {
				Content any `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &chatResp); err == nil && len(chatResp.Choices) > 0 {
		text := ""
		switch v := chatResp.Choices[0].Message.Content.(type) {
		case string:
			text = v
		case []any:
			for _, item := range v {
				if m, ok := item.(map[string]any); ok {
					if t, ok := m["text"].(string); ok {
						text += t
					}
				}
			}
		}
		return &GroqTranscriptionResponse{
			Text: strings.TrimSpace(text),
		}, nil
	}

	return nil, fmt.Errorf("could not parse transcription response: %s", string(respBody))
}

// EstimateCost calculates estimated cost based on audio duration.
func (c *GroqSTTClient) EstimateCost(audioDurationMs int64) float64 {
	hours := float64(audioDurationMs) / 1000.0 / 3600.0
	return hours * c.cfg.CostPerAudioHour
}

// TransientError wraps errors that should trigger retries.
type TransientError struct {
	Err error
}

func (e *TransientError) Error() string { return e.Err.Error() }
func (e *TransientError) Unwrap() error { return e.Err }

func isTransientGroqError(err error) bool {
	if err == nil {
		return false
	}
	_, ok := err.(*TransientError)
	return ok
}

func isDashScopeOrMaas(baseURL string) bool {
	lower := strings.ToLower(baseURL)
	return strings.Contains(lower, "aliyuncs.com") || strings.Contains(lower, "dashscope") || strings.Contains(lower, "maas")
}

func buildAudioTranscriptionsURL(baseURL string) string {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return "https://api.groq.com/openai/v1/audio/transcriptions"
	}
	if strings.HasSuffix(baseURL, "/audio/transcriptions") {
		return baseURL
	}
	if strings.HasSuffix(baseURL, "/v1") {
		return baseURL + "/audio/transcriptions"
	}
	if strings.Contains(baseURL, "groq.com") {
		return baseURL + "/openai/v1/audio/transcriptions"
	}
	return baseURL + "/v1/audio/transcriptions"
}
