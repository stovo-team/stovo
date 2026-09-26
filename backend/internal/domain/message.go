// Package domain contains business concepts with no transport or storage dependency.
package domain

// Member identifies a participant in a chat.
type Member struct {
	ID string
}

// Chat contains the message-send policy relevant to a conversation.
type Chat struct {
	ID              string
	Type            string
	CommentsEnabled bool
	CreatedBy       *string
	Members         []Member
}

// Sender identifies the user attempting to send a message.
type Sender struct {
	ID   string
	Role string
}

// SendMessage is the reference portion of a new message request.
// Content and attachment validation remain separate use cases.
type SendMessage struct {
	ReplyToMessageID    *string
	ThreadRootMessageID *string
}

// MessageCreated identifies a message that has already been stored durably.
type MessageCreated struct {
	EventID   string
	ChatID    string
	MessageID string
	Payload   map[string]any
}

// MessageNotification contains the recipient-facing details of a created message.
type MessageNotification struct {
	ChatID             string
	ChatType           string
	ChatTitle          *string
	SenderID           string
	SenderName         string
	Preview            string
	MentionedUserIDs   []string
	NotifyInForeground bool
}
