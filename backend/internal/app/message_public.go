package app

import (
	"encoding/json"
	"time"
)

type messagePublic struct {
	ID                  string                          `json:"id"`
	ChatID              string                          `json:"chatId"`
	SenderID            string                          `json:"senderId"`
	SenderDisplayName   *string                         `json:"senderDisplayName"`
	Type                string                          `json:"type"`
	Content             *string                         `json:"content"`
	EncryptionProtocol  string                          `json:"encryptionProtocol"`
	Ciphertext          *string                         `json:"ciphertext"`
	Nonce               *string                         `json:"nonce"`
	KeyVersion          *int                            `json:"keyVersion"`
	EncryptionMetadata  *string                         `json:"encryptionMetadata"`
	ReplyToMessageID    *string                         `json:"replyToMessageId"`
	ThreadRootMessageID *string                         `json:"threadRootMessageId"`
	MessageKind         string                          `json:"messageKind"`
	CommentCount        int                             `json:"commentCount"`
	CreatedAt           time.Time                       `json:"createdAt"`
	UpdatedAt           time.Time                       `json:"updatedAt"`
	DeletedAt           *time.Time                      `json:"deletedAt"`
	IsEdited            bool                            `json:"isEdited"`
	ImportAttribution   *messageImportAttributionPublic `json:"importAttribution,omitempty"`
	ForwardedFrom       *messageForwardPublic           `json:"forwardedFrom,omitempty"`
	Statuses            []messageStatusPublic           `json:"statuses"`
	Reactions           []messageReactionPublic         `json:"reactions"`
	Attachments         []filePublic                    `json:"attachments"`
	ClientMessageID     *string                         `json:"clientMessageId,omitempty"`
	Call                *callHistoryPublic              `json:"call,omitempty"`
	Poll                *pollPublic                     `json:"poll,omitempty"`
	Collection          *collectionCardPublic           `json:"collection,omitempty"`
	Canvas              *canvasCardPublic               `json:"canvas,omitempty"`
	Checklist           *checklistCardPublic            `json:"checklist,omitempty"`
}

type messageImportAttributionPublic struct {
	SourceProvider    string          `json:"sourceProvider"`
	SourceMessageID   string          `json:"sourceMessageId"`
	SourceAuthorID    string          `json:"sourceAuthorId"`
	SourceAuthorName  string          `json:"sourceAuthorName"`
	Reactions         json.RawMessage `json:"reactions,omitempty"`
	Metadata          json.RawMessage `json:"metadata,omitempty"`
	SourceAttachments json.RawMessage `json:"sourceAttachments,omitempty"`
	SourceDeletedAt   *string         `json:"sourceDeletedAt,omitempty"`
}
