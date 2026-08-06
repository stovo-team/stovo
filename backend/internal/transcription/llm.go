package transcription

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// LLMConfig holds the LLM configuration for post-processing.
type LLMConfig struct {
	APIKey  string
	Model   string
	BaseURL string
}

// LLMClient performs post-processing on transcripts using a chat completion API.
type LLMClient struct {
	cfg    LLMConfig
	client *http.Client
}

// NewLLMClient creates a new LLM post-processing client.
func NewLLMClient(cfg LLMConfig) *LLMClient {
	if cfg.BaseURL == "" {
		cfg.BaseURL = groqAPIBase
	}
	return &LLMClient{
		cfg:    cfg,
		client: &http.Client{Timeout: 120 * time.Second},
	}
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatCompletionRequest struct {
	Model          string        `json:"model"`
	Messages       []chatMessage `json:"messages"`
	Temperature    float64       `json:"temperature"`
	ResponseFormat *struct {
		Type string `json:"type"`
	} `json:"response_format,omitempty"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (c *LLMClient) callChat(ctx context.Context, req chatCompletionRequest) (string, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("llm: marshal request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.cfg.BaseURL+"/openai/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("llm: build request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpResp, err := c.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("llm: http request: %w", err)
	}
	defer httpResp.Body.Close()
	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return "", fmt.Errorf("llm: read body: %w", err)
	}
	if httpResp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llm: status %d: %s", httpResp.StatusCode, string(respBody))
	}
	var cr chatCompletionResponse
	if err := json.Unmarshal(respBody, &cr); err != nil {
		return "", fmt.Errorf("llm: unmarshal response: %w", err)
	}
	if len(cr.Choices) == 0 {
		return "", fmt.Errorf("llm: empty choices")
	}
	return cr.Choices[0].Message.Content, nil
}

// PostProcess generates summary, decisions, action items, and open questions from transcript segments.
func (c *LLMClient) PostProcess(ctx context.Context, segments []TranscriptSegmentForLLM) (*PostProcessingResult, error) {
	if len(segments) == 0 {
		return &PostProcessingResult{}, nil
	}

	var sb strings.Builder
	for _, seg := range segments {
		startSec := seg.StartMs / 1000
		sb.WriteString(fmt.Sprintf("[%02d:%02d] %s: %s\n", startSec/60, startSec%60, seg.ParticipantName, seg.Text))
	}

	systemPrompt := `You are an expert meeting analyst. Return ONLY valid JSON with this structure:
{"summary":"","decisions":[{"text":"","sourceSegmentIds":[]}],"actionItems":[{"text":"","assigneeParticipantId":null,"dueDate":null,"sourceSegmentIds":[]}],"openQuestions":[{"text":"","sourceSegmentIds":[]}]}
Preserve original languages. Do not translate. Do not invent facts.`

	content, err := c.callChat(ctx, chatCompletionRequest{
		Model: c.cfg.Model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: "Transcript:\n" + sb.String()},
		},
		Temperature: 0.1,
		ResponseFormat: &struct {
			Type string `json:"type"`
		}{Type: "json_object"},
	})
	if err != nil {
		return nil, err
	}
	var result PostProcessingResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("llm: unmarshal post-processing result: %w", err)
	}
	return &result, nil
}

// CleanTranscript generates a cleaned version of an exact transcript segment.
// It removes filler words and accidental repetitions without changing meaning.
func (c *LLMClient) CleanTranscript(ctx context.Context, exactText string) (string, error) {
	if strings.TrimSpace(exactText) == "" {
		return "", nil
	}
	content, err := c.callChat(ctx, chatCompletionRequest{
		Model: c.cfg.Model,
		Messages: []chatMessage{
			{Role: "system", Content: `Remove repeated filler words (uh, um, er) and accidental word repetitions. Do NOT change meaning, language, names, numbers, or dates. Return ONLY the cleaned text.`},
			{Role: "user", Content: exactText},
		},
		Temperature: 0.1,
	})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(content), nil
}
