package runtime

import (
	"context"
	"strings"
	"time"
)

// NtfyPayload defines the payload structure for external ntfy push notifications.
type NtfyPayload struct {
	Topic    string   `json:"topic"`
	Title    string   `json:"title"`
	Message  string   `json:"message"`
	Priority int      `json:"priority"`
	Tags     []string `json:"tags,omitempty"`
	Click    string   `json:"click,omitempty"`
}

// NtfyRetryItem represents a failed notification payload queued for retry.
type NtfyRetryItem struct {
	UserID  string
	Payload NtfyPayload
	Attempt int
}

// NtfyRetryWorkerOptions specifies delivery and observability callbacks for Ntfy retries.
type NtfyRetryWorkerOptions struct {
	Deliver   func(context.Context, NtfyRetryItem) error
	Succeeded func(item NtfyRetryItem, attempt int)
	Exhausted func(item NtfyRetryItem, attempt int)
}

// RunNtfyRetryWorker executes the backoff and delivery retry loop for ntfy notifications.
func RunNtfyRetryWorker(ctx context.Context, queue chan NtfyRetryItem, opts NtfyRetryWorkerOptions) {
	RetryWorker[NtfyRetryItem]{
		Delays:    []time.Duration{5 * time.Second, 15 * time.Second, 30 * time.Second},
		MaxTries:  3,
		Deliver:   opts.Deliver,
		Succeeded: opts.Succeeded,
		Exhausted: opts.Exhausted,
	}.Run(ctx, queue)
}

// FormatMessageNotification formats notification title, message, and tags depending on chat type.
func FormatMessageNotification(chatType string, chatTitle *string, senderName string, messagePreview string) (title string, message string, tags []string) {
	tags = []string{"speech_balloon"}
	if chatType == "direct" {
		tags = append(tags, "direct")
		return senderName, messagePreview, tags
	}
	title = "Chat"
	if chatTitle != nil {
		if trimmed := strings.TrimSpace(*chatTitle); trimmed != "" {
			title = trimmed
		}
	}
	return title, senderName + ": " + messagePreview, tags
}

// TruncateNotificationPreview truncates message previews exceeding 100 characters for push notifications.
func TruncateNotificationPreview(content *string) string {
	if content == nil {
		return "New message"
	}
	s := strings.TrimSpace(*content)
	if len(s) > 100 {
		return s[:100] + "…"
	}
	if s == "" {
		return "New message"
	}
	return s
}
