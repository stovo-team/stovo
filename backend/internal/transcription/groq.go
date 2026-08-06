package transcription

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
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

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		groqAPIBase+"/openai/v1/audio/transcriptions", &buf)
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
	if httpResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("groq: unexpected status %d: %s", httpResp.StatusCode, string(body))
	}

	var result GroqTranscriptionResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("groq: unmarshal response: %w", err)
	}
	return &result, nil
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
