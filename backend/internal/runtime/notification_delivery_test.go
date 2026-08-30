package runtime_test

import (
	"context"
	"testing"
	"time"

	"stovo-messenger/backend/internal/runtime"
)

func TestFormatMessageNotification(t *testing.T) {
	t.Run("direct chat", func(t *testing.T) {
		title, msg, tags := runtime.FormatMessageNotification("direct", nil, "Alice", "Hello Bob")
		if title != "Alice" {
			t.Errorf("expected title 'Alice', got '%s'", title)
		}
		if msg != "Hello Bob" {
			t.Errorf("expected msg 'Hello Bob', got '%s'", msg)
		}
		if len(tags) != 2 || tags[0] != "speech_balloon" || tags[1] != "direct" {
			t.Errorf("unexpected tags: %v", tags)
		}
	})

	t.Run("group chat with title", func(t *testing.T) {
		groupTitle := "Dev Team"
		title, msg, tags := runtime.FormatMessageNotification("group", &groupTitle, "Bob", "Build fixed")
		if title != "Dev Team" {
			t.Errorf("expected title 'Dev Team', got '%s'", title)
		}
		if msg != "Bob: Build fixed" {
			t.Errorf("expected msg 'Bob: Build fixed', got '%s'", msg)
		}
		if len(tags) != 1 || tags[0] != "speech_balloon" {
			t.Errorf("unexpected tags: %v", tags)
		}
	})

	t.Run("group chat without title", func(t *testing.T) {
		title, msg, tags := runtime.FormatMessageNotification("group", nil, "Bob", "Hello")
		if title != "Chat" {
			t.Errorf("expected default title 'Chat', got '%s'", title)
		}
		if msg != "Bob: Hello" {
			t.Errorf("expected msg 'Bob: Hello', got '%s'", msg)
		}
		_ = tags
	})
}

func TestTruncateNotificationPreview(t *testing.T) {
	if res := runtime.TruncateNotificationPreview(nil); res != "New message" {
		t.Errorf("expected 'New message', got '%s'", res)
	}

	empty := ""
	if res := runtime.TruncateNotificationPreview(&empty); res != "New message" {
		t.Errorf("expected 'New message', got '%s'", res)
	}

	short := "Short text"
	if res := runtime.TruncateNotificationPreview(&short); res != "Short text" {
		t.Errorf("expected 'Short text', got '%s'", res)
	}

	long := "12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890"
	if res := runtime.TruncateNotificationPreview(&long); len([]rune(res)) != 101 || res[len(res)-3:] != "…" {
		t.Errorf("expected truncated text with ellipsis, got '%s'", res)
	}
}

func TestRunNtfyRetryWorker(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	queue := make(chan runtime.NtfyRetryItem, 10)
	delivered := make(chan runtime.NtfyRetryItem, 10)

	opts := runtime.NtfyRetryWorkerOptions{
		Deliver: func(ctx context.Context, item runtime.NtfyRetryItem) error {
			delivered <- item
			return nil
		},
	}

	go runtime.RunNtfyRetryWorker(ctx, queue, opts)

	item := runtime.NtfyRetryItem{
		UserID:  "user-1",
		Payload: runtime.NtfyPayload{Topic: "topic-1", Message: "Test message"},
	}

	queue <- item

	select {
	case rec := <-delivered:
		if rec.UserID != "user-1" || rec.Payload.Message != "Test message" {
			t.Errorf("unexpected delivered item: %v", rec)
		}
	case <-time.After(7 * time.Second):
		t.Fatal("timed out waiting for ntfy retry worker delivery")
	}
}
