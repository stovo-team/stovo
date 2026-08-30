// Package groq adapts deployment configuration to the narrow provider options
// consumed by transcription and media integrations.
package groq

import (
	"strings"

	"stovo-messenger/backend/internal/config"
)

type Logger interface {
	Warnf(component, format string, args ...any)
}

type Options struct{ APIKey, BaseURL, STTModel, ChatModel string }

// Resolve performs the compatibility environment lookup at the infrastructure
// edge. Feature and runtime code receive only the resulting scalar options.
func Resolve(cfg *config.Config, logger Logger) Options {
	if cfg == nil {
		return Options{STTModel: "qwen3-asr-flash-2025-09-08"}
	}
	apiKey := firstUsable(cfg.GroqAPIKey, "GROQ_API_KEY", "groq_api_key", "GROQ_KEY", "groq_key", "GROQ_API_TOKEN", "groq_api_token", "GROQ_TOKEN")
	if apiKey != "" {
		cfg.GroqAPIKey = apiKey
	}
	baseURL := strings.TrimSpace(cfg.GroqBaseURL)
	if baseURL == "" {
		baseURL = first("GROQ_BASE_URL", "GROQ_API_BASE")
		if baseURL != "" {
			cfg.GroqBaseURL = baseURL
		}
	}
	chatModel := strings.TrimSpace(cfg.GroqChatModel)
	if chatModel == "" {
		chatModel = first("GROQ_CHAT_MODEL")
		if chatModel != "" {
			cfg.GroqChatModel = chatModel
		}
	}
	sttModel := first("GROQ_STT_MODEL")
	if sttModel == "" {
		sttModel = strings.TrimSpace(cfg.GroqSTTModel)
	}
	if sttModel == "" {
		sttModel = "qwen3-asr-flash-2025-09-08"
	}
	if strings.HasPrefix(strings.ToLower(sttModel), "qwen-plus") {
		fallback := "whisper-large-v3-turbo"
		base := strings.ToLower(baseURL)
		if strings.Contains(base, "aliyuncs.com") || strings.Contains(base, "dashscope") || strings.Contains(base, "maas") {
			fallback = "qwen3-asr-flash"
		}
		if logger != nil {
			logger.Warnf("transcription", "GROQ_STT_MODEL=%q is a chat model; using ASR model %q instead", sttModel, fallback)
		}
		sttModel = fallback
	}
	cfg.GroqSTTModel = sttModel
	return Options{APIKey: apiKey, BaseURL: baseURL, STTModel: sttModel, ChatModel: chatModel}
}

func firstUsable(current string, names ...string) string {
	if current = strings.TrimSpace(current); current != "" && !config.IsPlaceholderKey(current) {
		return current
	}
	for _, name := range names {
		if value := strings.TrimSpace(config.GetOrReloadEnv(name)); value != "" && !config.IsPlaceholderKey(value) {
			return value
		}
	}
	return ""
}
func first(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(config.GetOrReloadEnv(name)); value != "" {
			return value
		}
	}
	return ""
}
