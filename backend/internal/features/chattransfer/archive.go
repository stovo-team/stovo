package chattransfer

import (
	"fmt"
	"path"
	"strings"
	"time"
)

const SchemaVersion = 1

const (
	MaxMessages            = 50_000
	MaxParticipants        = 10_000
	MaxAttachments         = 10_000
	MaxAttachmentBytes     = 50 * 1024 * 1024
	MaxTotalAttachmentSize = 100 * 1024 * 1024
)

type Source struct {
	ProviderID string `json:"providerId"`
	ProfileID  string `json:"profileId"`
}

type Conversation struct {
	SourceID string         `json:"sourceId,omitempty"`
	Title    string         `json:"title"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type Participant struct {
	SourceID    string            `json:"sourceId"`
	DisplayName string            `json:"displayName"`
	Attributes  map[string]string `json:"attributes,omitempty"`
}

type Reaction struct {
	Emoji          string   `json:"emoji"`
	ParticipantIDs []string `json:"participantIds,omitempty"`
}

type Message struct {
	SourceID           string         `json:"sourceId"`
	AuthorID           string         `json:"authorId"`
	Timestamp          time.Time      `json:"timestamp"`
	Kind               string         `json:"kind"`
	Text               *string        `json:"text,omitempty"`
	ReplyToSourceID    string         `json:"replyToSourceId,omitempty"`
	ThreadRootSourceID string         `json:"threadRootSourceId,omitempty"`
	AttachmentIDs      []string       `json:"attachmentIds,omitempty"`
	Reactions          []Reaction     `json:"reactions,omitempty"`
	IsEdited           bool           `json:"isEdited,omitempty"`
	DeletedAt          *time.Time     `json:"deletedAt,omitempty"`
	Metadata           map[string]any `json:"metadata,omitempty"`
}

type Attachment struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	Filename    string `json:"filename"`
	MIMEType    string `json:"mimeType"`
	Size        int64  `json:"size"`
	Checksum    string `json:"checksum,omitempty"`
	Bytes       []byte `json:"bytes,omitempty"`
	ExternalURL string `json:"externalUrl,omitempty"`
}

type Warning struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Archive struct {
	SchemaVersion int            `json:"schemaVersion"`
	Source        Source         `json:"source"`
	ExportedAt    *time.Time     `json:"exportedAt,omitempty"`
	Conversation  Conversation   `json:"conversation"`
	Conversations []Conversation `json:"conversations,omitempty"`
	Participants  []Participant  `json:"participants"`
	Messages      []Message      `json:"messages"`
	Attachments   []Attachment   `json:"attachments"`
	Warnings      []Warning      `json:"warnings"`
}

type ValidationError struct {
	Code    string
	Message string
}

func (e *ValidationError) Error() string {
	return e.Message
}

func invalid(code, message string) error {
	return &ValidationError{Code: code, Message: message}
}

func supportedProfile(providerID, profileID string) bool {
	switch providerID {
	case "stovo":
		return profileID == "stovo-chat-archive-v1"
	case "telegram":
		return profileID == "telegram-desktop-json"
	case "whatsapp":
		return profileID == "whatsapp-chat-txt"
	case "slack":
		return profileID == "slack-channel-zip" || profileID == "slack-channel-json"
	case "mattermost":
		return profileID == "mattermost-channel-csv"
	case "rocketchat":
		return profileID == "rocketchat-room-json"
	default:
		return false
	}
}

func nonempty(value string) bool {
	return strings.TrimSpace(value) != ""
}

func safeRelativePath(value string) bool {
	if value == "" || strings.Contains(value, `\`) || strings.HasPrefix(value, "/") || (len(value) >= 2 && value[1] == ':') {
		return false
	}
	cleaned := path.Clean(value)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") || cleaned != value {
		return false
	}
	for _, part := range strings.Split(value, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

// ValidateArchive checks the provider-neutral import envelope before the app
// layer is allowed to authorize or persist it. It deliberately performs no
// database, storage, or provider API work.
func ValidateArchive(archive Archive) error {
	if archive.SchemaVersion != SchemaVersion {
		return invalid("unsupported_schema_version", "only ChatArchive schema version 1 is supported")
	}
	if len(archive.Conversations) > 1 {
		return invalid("multiple_conversations", "V1 imports exactly one conversation per archive")
	}
	if !nonempty(archive.Source.ProviderID) {
		return invalid("unsupported_provider", "archive source must name a supported provider")
	}
	if !supportedProfile(archive.Source.ProviderID, archive.Source.ProfileID) {
		return invalid("unsupported_profile", fmt.Sprintf("unsupported %s archive profile: %s", archive.Source.ProviderID, archive.Source.ProfileID))
	}
	if !nonempty(archive.Conversation.SourceID) || !nonempty(archive.Conversation.Title) {
		return invalid("conversation_required", "archive must contain one conversation with a source ID and title")
	}
	if archive.ExportedAt != nil && archive.ExportedAt.IsZero() {
		return invalid("invalid_timestamp", "exportedAt must be a valid timestamp")
	}
	if len(archive.Participants) > MaxParticipants {
		return invalid("too_many_participants", "archive exceeds the participant limit")
	}
	if len(archive.Messages) > MaxMessages {
		return invalid("too_many_messages", "archive exceeds the message limit")
	}
	if len(archive.Attachments) > MaxAttachments {
		return invalid("too_many_attachments", "archive exceeds the attachment count limit")
	}

	participantIDs := make(map[string]struct{}, len(archive.Participants))
	for _, participant := range archive.Participants {
		if !nonempty(participant.SourceID) || !nonempty(participant.DisplayName) {
			return invalid("invalid_archive", "each participant needs a source ID and display name")
		}
		if _, exists := participantIDs[participant.SourceID]; exists {
			return invalid("duplicate_participant_id", "duplicate participant source ID: "+participant.SourceID)
		}
		participantIDs[participant.SourceID] = struct{}{}
	}

	messageIDs := make(map[string]struct{}, len(archive.Messages))
	attachmentReferences := make(map[string]struct{})
	var previous time.Time
	for index, message := range archive.Messages {
		if !nonempty(message.SourceID) || !nonempty(message.AuthorID) || !nonempty(message.Kind) {
			return invalid("invalid_archive", "each message needs a source ID, author ID, and kind")
		}
		if _, exists := messageIDs[message.SourceID]; exists {
			return invalid("duplicate_message_id", "duplicate message source ID: "+message.SourceID)
		}
		if _, exists := participantIDs[message.AuthorID]; !exists {
			return invalid("unknown_author", "message author is not in participants: "+message.AuthorID)
		}
		if message.Timestamp.IsZero() {
			return invalid("invalid_timestamp", "message "+message.SourceID+" has an invalid timestamp")
		}
		if index > 0 && message.Timestamp.Before(previous) {
			return invalid("messages_not_chronological", "messages must be ordered by ascending timestamp")
		}
		previous = message.Timestamp
		messageIDs[message.SourceID] = struct{}{}
		if message.DeletedAt != nil && message.DeletedAt.IsZero() {
			return invalid("invalid_timestamp", "message "+message.SourceID+" has an invalid deletedAt timestamp")
		}
		for _, id := range message.AttachmentIDs {
			if !nonempty(id) {
				return invalid("invalid_attachment", "message attachment IDs must be non-empty")
			}
			attachmentReferences[id] = struct{}{}
		}
	}
	for _, message := range archive.Messages {
		for _, replyID := range []string{message.ReplyToSourceID, message.ThreadRootSourceID} {
			if replyID == "" {
				continue
			}
			if _, exists := messageIDs[replyID]; !exists {
				return invalid("unknown_reply_target", "message references unknown reply target: "+replyID)
			}
		}
	}

	attachmentIDs := make(map[string]struct{}, len(archive.Attachments))
	var totalAttachmentBytes int64
	for _, attachment := range archive.Attachments {
		if !nonempty(attachment.ID) || !safeRelativePath(attachment.Path) || !nonempty(attachment.Filename) || !nonempty(attachment.MIMEType) {
			return invalid("unsafe_attachment_path", "attachment metadata contains an unsafe path or missing identity")
		}
		if _, exists := attachmentIDs[attachment.ID]; exists {
			return invalid("duplicate_attachment_id", "duplicate attachment ID: "+attachment.ID)
		}
		if attachment.Size < 0 || int64(len(attachment.Bytes)) != attachment.Size && len(attachment.Bytes) > 0 {
			return invalid("invalid_attachment", "attachment size does not match its bytes: "+attachment.ID)
		}
		if attachment.Size > MaxAttachmentBytes {
			return invalid("attachment_too_large", "attachment exceeds the per-file size limit: "+attachment.ID)
		}
		totalAttachmentBytes += attachment.Size
		if totalAttachmentBytes > MaxTotalAttachmentSize {
			return invalid("archive_attachments_too_large", "archive exceeds the total attachment size limit")
		}
		attachmentIDs[attachment.ID] = struct{}{}
	}
	for id := range attachmentReferences {
		if _, exists := attachmentIDs[id]; !exists {
			return invalid("unknown_attachment", "message references unknown attachment: "+id)
		}
	}
	for _, warning := range archive.Warnings {
		if !nonempty(warning.Code) || !nonempty(warning.Message) {
			return invalid("invalid_warning", "each warning needs a code and message")
		}
	}
	return nil
}
