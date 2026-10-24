package chattransfer

import (
	"errors"
	"testing"
	"time"
)

func validArchive() Archive {
	text := "Hello"
	return Archive{
		SchemaVersion: 1,
		Source:        Source{ProviderID: "telegram", ProfileID: "telegram-desktop-json"},
		Conversation:  Conversation{SourceID: "chat-1", Title: "Planning"},
		Participants:  []Participant{{SourceID: "user-1", DisplayName: "Mira"}},
		Messages: []Message{{
			SourceID:  "message-1",
			AuthorID:  "user-1",
			Timestamp: time.Date(2026, 10, 10, 8, 0, 0, 0, time.UTC),
			Kind:      "text",
			Text:      &text,
		}},
	}
}

func TestValidateArchiveAcceptsOneVersionedConversation(t *testing.T) {
	if err := ValidateArchive(validArchive()); err != nil {
		t.Fatalf("ValidateArchive() error = %v", err)
	}
}

func TestValidateArchiveRejectsInvalidCoreFields(t *testing.T) {
	tests := []struct {
		name string
		edit func(*Archive)
		code string
	}{
		{
			name: "unknown schema",
			edit: func(archive *Archive) { archive.SchemaVersion = 99 },
			code: "unsupported_schema_version",
		},
		{
			name: "missing conversation identity",
			edit: func(archive *Archive) { archive.Conversation.SourceID = "" },
			code: "conversation_required",
		},
		{
			name: "invalid timestamp",
			edit: func(archive *Archive) { archive.Messages[0].Timestamp = time.Time{} },
			code: "invalid_timestamp",
		},
		{
			name: "duplicate message IDs",
			edit: func(archive *Archive) { archive.Messages = append(archive.Messages, archive.Messages[0]) },
			code: "duplicate_message_id",
		},
		{
			name: "unknown attachment reference",
			edit: func(archive *Archive) { archive.Messages[0].AttachmentIDs = []string{"missing"} },
			code: "unknown_attachment",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			archive := validArchive()
			test.edit(&archive)

			err := ValidateArchive(archive)
			if err == nil {
				t.Fatal("ValidateArchive() error = nil, want validation error")
			}
			var validationError *ValidationError
			if !errors.As(err, &validationError) {
				t.Fatalf("ValidateArchive() error type = %T, want *ValidationError", err)
			}
			if validationError.Code != test.code {
				t.Fatalf("validation error code = %q, want %q", validationError.Code, test.code)
			}
		})
	}
}
